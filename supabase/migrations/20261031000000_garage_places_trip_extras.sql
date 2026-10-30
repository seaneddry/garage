-- Saved places (office, home, clients), auto Work tagging, tolls & parking on trips --------

-- ---------------------------------------------------------------- helpers
-- Straight-line km between two points.
create or replace function public.garage_km(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- The signed-in person's expense category with this name, created if they don't have it yet
-- (family members who never set up the Expense Tracker still get Petrol, Vehicle, ...).
create or replace function public.garage_category(p_name text)
returns uuid language plpgsql set search_path = 'public' as $$
declare v uuid;
begin
  select id into v from categories where user_id = auth.uid() and lower(name) = lower(p_name)
   order by is_active desc limit 1;
  if v is null then
    insert into categories (name, sort_order) values (p_name, 99) returning id into v;
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------- places
create table public.garage_places (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('office', 'home', 'client', 'other')),
  name        text not null check (length(trim(name)) > 0),
  address     text,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  radius_m    int not null default 200 check (radius_m between 50 and 2000),
  -- Road km from the office (clients only), kept so trips can be claimed without a lookup.
  office_km   numeric(8,1) check (office_km >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index garage_places_one_office on public.garage_places (user_id) where kind = 'office';
create unique index garage_places_one_home on public.garage_places (user_id) where kind = 'home';
create index garage_places_user_idx on public.garage_places (user_id);
create trigger garage_places_set_updated_at before update on public.garage_places
  for each row execute function public.set_updated_at();
alter table public.garage_places enable row level security;
create policy "owner access" on public.garage_places for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.garage_places from anon;

-- The office used to live in settings.
insert into public.garage_places (user_id, kind, name, lat, lng)
select user_id, 'office', coalesce(nullif(trim(office_label), ''), 'Office'), office_lat, office_lng
  from public.garage_settings where office_lat is not null and office_lng is not null;
-- (office_label / office_lat / office_lng in settings are no longer read; left in place.)
alter table public.garage_settings add column claim_name text;

-- ---------------------------------------------------------------- auto Work tagging
alter table public.garage_trips
  add column place_id     uuid references public.garage_places (id) on delete set null,
  add column auto_tagged  boolean not null default false;

-- The person's saved client nearest to a point, if the point is inside its radius.
create or replace function public.garage_client_at(p_user uuid, p_lat double precision, p_lng double precision)
returns public.garage_places language sql stable security definer set search_path = '' as $$
  select p.* from public.garage_places p
   where p.user_id = p_user and p.kind = 'client'
     and p_lat is not null and p_lng is not null
     and public.garage_km(p.lat, p.lng, p_lat, p_lng) * 1000 <= p.radius_m
   order by public.garage_km(p.lat, p.lng, p_lat, p_lng)
   limit 1
$$;
revoke execute on function public.garage_client_at(uuid, double precision, double precision) from public, anon, authenticated;

-- Fills a trip in from a client place: Work, client name, destination, office claim.
create or replace function public.garage_apply_place(t public.garage_trips, p public.garage_places)
returns public.garage_trips language plpgsql set search_path = '' as $$
begin
  t.purpose := 'work';
  t.client := coalesce(nullif(trim(t.client), ''), p.name);
  t.place_id := p.id;
  t.auto_tagged := true;
  if t.dest_lat is null then
    t.dest_lat := p.lat; t.dest_lng := p.lng; t.dest_label := p.name;
  end if;
  if t.claim_km is null and p.office_km is not null then
    t.office_km := p.office_km;
    t.claim_km := p.office_km * case when t.claim_return then 2 else 1 end;
    t.claim_source := 'office';
  end if;
  return t;
end $$;

-- When a trip ends (app or CarPlay) at or from a saved client, it becomes a Work trip.
create or replace function public.garage_trips_auto_tag()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.garage_places;
begin
  if new.purpose <> 'private' or new.auto_tagged or new.end_lat is null then return new; end if;
  if tg_op = 'UPDATE' and old.end_lat is not null then return new; end if;
  p := public.garage_client_at(new.user_id, new.end_lat, new.end_lng);
  if p.id is null then p := public.garage_client_at(new.user_id, new.start_lat, new.start_lng); end if;
  if p.id is null then return new; end if;
  return public.garage_apply_place(new, p);
end $$;
create trigger garage_trips_auto_tag before insert or update of end_lat, end_lng on public.garage_trips
  for each row execute function public.garage_trips_auto_tag();

-- Past Private trips that started or ended at a client: count them, or tag them as Work.
create or replace function public.garage_tag_trips_at_place(p_place uuid, p_apply boolean default false, p_days int default 120)
returns int language plpgsql set search_path = '' as $$
declare
  p public.garage_places;
  t public.garage_trips;
  n int := 0;
begin
  select * into p from public.garage_places where id = p_place and user_id = auth.uid() and kind = 'client';
  if p.id is null then return 0; end if;
  for t in
    select * from public.garage_trips
     where user_id = auth.uid() and purpose = 'private' and started_at > now() - make_interval(days => p_days)
       and ((end_lat is not null and public.garage_km(p.lat, p.lng, end_lat, end_lng) * 1000 <= p.radius_m)
         or (start_lat is not null and public.garage_km(p.lat, p.lng, start_lat, start_lng) * 1000 <= p.radius_m))
  loop
    n := n + 1;
    if p_apply then
      t := public.garage_apply_place(t, p);
      update public.garage_trips
         set purpose = t.purpose, client = t.client, place_id = t.place_id, auto_tagged = true,
             dest_lat = t.dest_lat, dest_lng = t.dest_lng, dest_label = t.dest_label,
             office_km = t.office_km, claim_km = t.claim_km, claim_source = t.claim_source
       where id = t.id;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- tolls & parking
-- A toll or parking expense (in the Expense Tracker's "Parking & Tolls") claimed with a trip.
create table public.garage_trip_extras (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id         uuid not null references public.garage_trips (id) on delete cascade,
  transaction_id  uuid not null unique references public.transactions (id) on delete cascade,
  kind            text not null check (kind in ('toll', 'parking')),
  created_at      timestamptz not null default now()
);
create index garage_trip_extras_trip_idx on public.garage_trip_extras (trip_id);
alter table public.garage_trip_extras enable row level security;
create policy "owner access" on public.garage_trip_extras for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.garage_trips g where g.id = trip_id and g.user_id = (select auth.uid()))
  );
revoke all on public.garage_trip_extras from anon;

create view public.garage_trip_extras_v with (security_invoker = true) as
select x.id, x.trip_id, x.transaction_id, x.kind, t.occurred_on, t.description, t.amount
  from public.garage_trip_extras x join public.transactions t on t.id = x.transaction_id;

-- Toll and parking expenses not yet on any trip, to offer on a trip from the same day.
create view public.garage_unclaimed_tolls with (security_invoker = true) as
select t.id as transaction_id, t.occurred_on, t.description, t.amount
  from public.transactions t join public.categories c on c.id = t.category_id
 where lower(c.name) in ('parking & tolls', 'parking and tolls', 'tolls & parking', 'parking', 'toll', 'tolls')
   and not exists (select 1 from public.garage_trip_extras x where x.transaction_id = t.id);
revoke all on public.garage_trip_extras_v, public.garage_unclaimed_tolls from anon;

-- New toll or parking: an expense in "Parking & Tolls", claimed with the trip.
create or replace function public.garage_add_trip_extra(p_trip uuid, p_kind text, p_amount numeric,
                                                        p_label text default null, p_date date default null)
returns uuid language plpgsql set search_path = 'public' as $$
declare
  v_trip garage_trips;
  v_tx uuid;
  v_id uuid;
begin
  if p_kind not in ('toll', 'parking') then raise exception 'Pick toll or parking.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount.'; end if;
  select * into v_trip from garage_trips where id = p_trip and user_id = auth.uid();
  if v_trip.id is null then raise exception 'This trip no longer exists.'; end if;
  insert into transactions (occurred_on, description, category_id, amount)
  values (coalesce(p_date, (v_trip.started_at at time zone 'Asia/Kuala_Lumpur')::date),
          coalesce(nullif(trim(p_label), ''), case p_kind when 'toll' then 'Toll' else 'Parking' end),
          garage_category('Parking & Tolls'), p_amount)
  returning id into v_tx;
  insert into garage_trip_extras (trip_id, transaction_id, kind) values (p_trip, v_tx, p_kind) returning id into v_id;
  return v_id;
end $$;

grant execute on function public.garage_category(text), public.garage_tag_trips_at_place(uuid, boolean, int),
  public.garage_add_trip_extra(uuid, text, numeric, text, date) to authenticated;
revoke execute on function public.garage_category(text), public.garage_tag_trips_at_place(uuid, boolean, int),
  public.garage_add_trip_extra(uuid, text, numeric, text, date) from anon;

-- ---------------------------------------------------------------- saving costs
-- Same as before, but a missing Petrol / Vehicle category is created instead of refused.
create or replace function public.garage_save_entry(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id        uuid := nullif(p->>'id', '')::uuid;
  v_tx        uuid := nullif(p->>'transaction_id', '')::uuid;
  v_vehicle   uuid := nullif(p->>'vehicle_id', '')::uuid;
  v_kind      text := p->>'kind';
  v_date      date := nullif(p->>'occurred_on', '')::date;
  v_amount    numeric := nullif(p->>'amount', '')::numeric;
  v_title     text := nullif(trim(p->>'title'), '');
  v_desc      text;
  v_cat       uuid;
  v_cat_name  text;
  v_odo       int := nullif(p->>'odometer_km', '')::int;
  v_existing  uuid;
begin
  if v_kind is null or v_kind not in ('fuel', 'service', 'renewal', 'care', 'other') then
    raise exception 'Unknown entry type.';
  end if;
  if v_date is null then raise exception 'Pick a date.'; end if;
  if v_amount is null or v_amount < 0 then raise exception 'Enter the amount.'; end if;
  if v_vehicle is null or not exists (select 1 from garage_vehicles where id = v_vehicle) then
    raise exception 'Pick a car.';
  end if;

  v_cat_name := case when v_kind = 'fuel' then 'petrol' else 'vehicle' end;
  -- Created for people who haven't set the category up (family members without the Expense Tracker).
  v_cat := garage_category(initcap(v_cat_name));

  v_desc := coalesce(v_title, case v_kind when 'fuel' then 'Petrol' when 'care' then 'Car wash'
                                          when 'renewal' then 'Renewal' else 'Car service' end);

  if v_id is not null then
    select transaction_id into v_existing from garage_entries where id = v_id;
    if not found then raise exception 'This record no longer exists.'; end if;
    v_tx := coalesce(v_existing, v_tx);
  end if;

  if v_tx is not null then
    update transactions
       set occurred_on = v_date, description = v_desc, amount = v_amount, category_id = v_cat
     where id = v_tx;
    if not found then v_tx := null; end if;
  end if;

  if v_tx is null then
    insert into transactions (occurred_on, description, category_id, amount)
    values (v_date, v_desc, v_cat, v_amount)
    returning id into v_tx;
  end if;

  if v_id is null then
    insert into garage_entries (vehicle_id, transaction_id, kind, occurred_on, title, odometer_km, litres,
                                fuel_grade, full_tank, place, notes, receipt_path)
    values (v_vehicle, v_tx, v_kind, v_date, v_title, v_odo, nullif(p->>'litres', '')::numeric,
            nullif(trim(p->>'fuel_grade'), ''), coalesce((p->>'full_tank')::boolean, true),
            nullif(trim(p->>'place'), ''), nullif(trim(p->>'notes'), ''), nullif(p->>'receipt_path', ''))
    returning id into v_id;
  else
    update garage_entries
       set vehicle_id = v_vehicle, transaction_id = v_tx, kind = v_kind, occurred_on = v_date, title = v_title,
           odometer_km = v_odo, litres = nullif(p->>'litres', '')::numeric,
           fuel_grade = nullif(trim(p->>'fuel_grade'), ''), full_tank = coalesce((p->>'full_tank')::boolean, true),
           place = nullif(trim(p->>'place'), ''), notes = nullif(trim(p->>'notes'), ''),
           cost_removed = false, removed_amount = null, excluded = false,
           receipt_path = case when p ? 'receipt_path' then nullif(p->>'receipt_path', '') else receipt_path end
     where id = v_id;
  end if;

  delete from garage_entry_items where entry_id = v_id;
  insert into garage_entry_items (entry_id, name, amount, sort)
  select v_id, trim(i->>'name'), nullif(i->>'amount', '')::numeric, (ord - 1)::int
  from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) with ordinality as x(i, ord)
  where nullif(trim(i->>'name'), '') is not null;

  -- A service that does a reminder's job resets that reminder.
  if v_kind = 'service' then
    update garage_reminders r
       set last_done_on = v_date, last_done_km = coalesce(v_odo, r.last_done_km)
     where r.vehicle_id = v_vehicle and r.active and r.match is not null
       and (r.last_done_on is null or r.last_done_on <= v_date)
       and (v_desc ~* r.match
            or exists (select 1 from garage_entry_items it where it.entry_id = v_id and it.name ~* r.match));
  end if;

  return v_id;
end;
$$;
