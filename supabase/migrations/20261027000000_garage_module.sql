-- Garage: car records that share money with the Expense Tracker ----------------------
-- Every cost lives once, in public.transactions. Garage rows only add car details
-- (odometer, litres, parts, workshop) and point at the transaction they belong to.

-- Tables --------------------------------------------------------------------------------
create table public.garage_vehicles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  make         text not null,
  model        text not null,
  variant      text,
  year         int check (year between 1950 and 2100),
  plate        text,
  tank_litres  numeric(5,1) check (tank_litres > 0),
  fuel_grade   text,
  photo_path   text,
  is_default   boolean not null default false,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index garage_vehicles_one_default on public.garage_vehicles (user_id) where is_default;
create trigger garage_vehicles_set_updated_at before update on public.garage_vehicles
  for each row execute function public.set_updated_at();

-- Odometer readings typed in on their own (fill-ups and services carry their own reading).
create table public.garage_odometer (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id  uuid not null references public.garage_vehicles (id) on delete cascade,
  read_on     date not null,
  km          int not null check (km >= 0),
  created_at  timestamptz not null default now()
);
create index garage_odometer_vehicle_idx on public.garage_odometer (vehicle_id, read_on);

create table public.garage_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id      uuid references public.garage_vehicles (id) on delete cascade,
  transaction_id  uuid unique references public.transactions (id) on delete set null,
  kind            text not null check (kind in ('fuel', 'service', 'renewal', 'care', 'other')),
  occurred_on     date not null,
  title           text,
  odometer_km     int check (odometer_km >= 0),
  litres          numeric(7,2) check (litres > 0),
  fuel_grade      text,
  full_tank       boolean not null default true,
  place           text,
  notes           text,
  -- Set when the linked expense is deleted in the Expense Tracker: the car details stay.
  cost_removed    boolean not null default false,
  removed_amount  numeric(12,2),
  -- A Petrol/Vehicle expense that is not for any of your cars (a friend's car, a rental).
  excluded        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (excluded or vehicle_id is not null)
);
create index garage_entries_vehicle_idx on public.garage_entries (vehicle_id, occurred_on desc);
create trigger garage_entries_set_updated_at before update on public.garage_entries
  for each row execute function public.set_updated_at();

create table public.garage_entry_items (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id  uuid not null references public.garage_entries (id) on delete cascade,
  name      text not null,
  amount    numeric(12,2),
  sort      int not null default 0
);
create index garage_entry_items_entry_idx on public.garage_entry_items (entry_id);

create table public.garage_reminders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id     uuid not null references public.garage_vehicles (id) on delete cascade,
  name           text not null,
  every_months   int check (every_months > 0),
  every_km       int check (every_km > 0),
  last_done_on   date,
  last_done_km   int check (last_done_km >= 0),
  due_on         date,
  alert_days     int not null default 14 check (alert_days >= 0),
  -- Words that mark a service as doing this job (regex, case-insensitive), e.g. 'oil'.
  match          text,
  is_primary     boolean not null default false,
  active         boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index garage_reminders_vehicle_idx on public.garage_reminders (vehicle_id);
create trigger garage_reminders_set_updated_at before update on public.garage_reminders
  for each row execute function public.set_updated_at();

create table public.garage_settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Petrol/Vehicle expenses from this date without car details are flagged "Needs details".
  tracking_from  date not null default public.kl_today(),
  updated_at     timestamptz not null default now()
);

-- Row level security ----------------------------------------------------------------------
alter table public.garage_vehicles    enable row level security;
alter table public.garage_odometer    enable row level security;
alter table public.garage_entries     enable row level security;
alter table public.garage_entry_items enable row level security;
alter table public.garage_reminders   enable row level security;
alter table public.garage_settings    enable row level security;

create policy "owner access" on public.garage_vehicles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.garage_odometer for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.garage_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.garage_entry_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.garage_reminders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.garage_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.garage_vehicles, public.garage_odometer, public.garage_entries,
  public.garage_entry_items, public.garage_reminders, public.garage_settings from anon;

-- When an expense is deleted in the Expense Tracker, keep the car details and flag them.
create or replace function public.garage_on_transaction_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.garage_entries
     set cost_removed = true,
         removed_amount = old.amount,
         title = coalesce(title, old.description),
         occurred_on = old.occurred_on
   where transaction_id = old.id
     and not excluded;
  delete from public.garage_entries where transaction_id = old.id and excluded;
  return old;
end;
$$;

create trigger transactions_garage_on_delete
  before delete on public.transactions
  for each row execute function public.garage_on_transaction_delete();

-- How an expense without car details is grouped.
create or replace function public.garage_guess_kind(p_category text, p_description text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(p_category) = 'petrol' then 'fuel'
    when p_description ~* '(wash|cuci|detail|polish|coating|wax)' then 'care'
    when p_description ~* '(road ?tax|cukai|insuran|takaful|puspakom|jpj|saman|summon)' then 'renewal'
    when p_description ~* '(servis|service|oil|minyak hitam|filter|tyre|tayar|tire|batter|bateri|brake|brek|plug|coolant|alignment|balancing|aircond|wiper|bulb|mentol|repair|baiki|workshop|bengkel)' then 'service'
    else 'other'
  end
$$;

-- Every car cost: Garage entries (with or without their expense) plus Petrol/Vehicle
-- expenses that have no car details yet (counted against the default car).
create view public.garage_costs with (security_invoker = true) as
select e.id                                           as entry_id,
       t.id                                           as transaction_id,
       e.vehicle_id,
       e.kind,
       coalesce(t.occurred_on, e.occurred_on)         as occurred_on,
       coalesce(e.title, t.description)               as title,
       t.description                                  as expense_description,
       case when e.cost_removed then null else t.amount end as amount,
       e.removed_amount,
       e.odometer_km,
       e.litres,
       e.fuel_grade,
       e.full_tank,
       e.place,
       e.notes,
       e.cost_removed,
       false                                          as needs_details,
       c.name                                         as category
from public.garage_entries e
left join public.transactions t on t.id = e.transaction_id
left join public.categories   c on c.id = t.category_id
where not e.excluded
union all
select null,
       t.id,
       (select v.id from public.garage_vehicles v where v.is_default limit 1),
       public.garage_guess_kind(c.name, t.description),
       t.occurred_on,
       t.description,
       t.description,
       t.amount,
       null,
       null, null, null, null, null, null,
       false,
       public.garage_guess_kind(c.name, t.description) in ('fuel', 'service')
         and t.occurred_on >= coalesce((select s.tracking_from from public.garage_settings s), public.kl_today()),
       c.name
from public.transactions t
join public.categories c on c.id = t.category_id
where lower(c.name) in ('petrol', 'vehicle')
  and not exists (select 1 from public.garage_entries e where e.transaction_id = t.id);

-- Every odometer reading for a car, from fill-ups, services and manual updates.
create view public.garage_readings with (security_invoker = true) as
select e.vehicle_id, coalesce(t.occurred_on, e.occurred_on) as read_on, e.odometer_km as km, 'entry' as source
from public.garage_entries e
left join public.transactions t on t.id = e.transaction_id
where e.odometer_km is not null and not e.excluded
union all
select o.vehicle_id, o.read_on, o.km, 'manual'
from public.garage_odometer o;

revoke all on public.garage_costs, public.garage_readings from anon;

-- Save a fill-up or service: the expense and its car details together, in one go ------------
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
  select id into v_cat from categories where lower(name) = v_cat_name and user_id = auth.uid() limit 1;
  if v_cat is null then
    raise exception 'Add a "%" category in the Expense Tracker first.', initcap(v_cat_name);
  end if;

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
                                fuel_grade, full_tank, place, notes)
    values (v_vehicle, v_tx, v_kind, v_date, v_title, v_odo, nullif(p->>'litres', '')::numeric,
            nullif(trim(p->>'fuel_grade'), ''), coalesce((p->>'full_tank')::boolean, true),
            nullif(trim(p->>'place'), ''), nullif(trim(p->>'notes'), ''))
    returning id into v_id;
  else
    update garage_entries
       set vehicle_id = v_vehicle, transaction_id = v_tx, kind = v_kind, occurred_on = v_date, title = v_title,
           odometer_km = v_odo, litres = nullif(p->>'litres', '')::numeric,
           fuel_grade = nullif(trim(p->>'fuel_grade'), ''), full_tank = coalesce((p->>'full_tank')::boolean, true),
           place = nullif(trim(p->>'place'), ''), notes = nullif(trim(p->>'notes'), ''),
           cost_removed = false, removed_amount = null, excluded = false
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

-- Delete a record; optionally its expense too ----------------------------------------------
create or replace function public.garage_delete_entry(p_id uuid, p_delete_expense boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx uuid;
begin
  select transaction_id into v_tx from garage_entries where id = p_id;
  if not found then raise exception 'This record no longer exists.'; end if;
  delete from garage_entries where id = p_id;
  if p_delete_expense and v_tx is not null then
    delete from transactions where id = v_tx;
  end if;
end;
$$;

-- Mark an expense as not for any of your cars (or undo it) -----------------------------------
create or replace function public.garage_set_excluded(p_transaction_id uuid, p_excluded boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_t record;
begin
  if p_excluded then
    select t.occurred_on, t.description, c.name as cat into v_t
    from transactions t join categories c on c.id = t.category_id where t.id = p_transaction_id;
    if not found then raise exception 'That expense no longer exists.'; end if;
    insert into garage_entries (transaction_id, kind, occurred_on, excluded)
    values (p_transaction_id, garage_guess_kind(v_t.cat, v_t.description), v_t.occurred_on, true)
    on conflict (transaction_id) do update set excluded = true;
  else
    delete from garage_entries where transaction_id = p_transaction_id and excluded;
  end if;
end;
$$;

revoke execute on function public.garage_save_entry(jsonb), public.garage_delete_entry(uuid, boolean),
  public.garage_set_excluded(uuid, boolean) from public, anon;
grant execute on function public.garage_save_entry(jsonb), public.garage_delete_entry(uuid, boolean),
  public.garage_set_excluded(uuid, boolean) to authenticated;

-- Private storage for car photos -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garage', 'garage', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "garage files read" on storage.objects for select to authenticated
  using (bucket_id = 'garage' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "garage files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'garage' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "garage files update" on storage.objects for update to authenticated
  using (bucket_id = 'garage' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "garage files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'garage' and (storage.foldername(name))[1] = (select auth.uid())::text);
