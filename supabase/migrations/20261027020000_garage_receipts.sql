-- Garage phase 3: keep the scanned receipt (photo or PDF) with each record -------------

alter table public.garage_entries add column receipt_path text;

update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
 where id = 'garage';

create or replace view public.garage_costs with (security_invoker = true) as
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
       c.name                                         as category,
       e.receipt_path
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
       c.name,
       null
from public.transactions t
join public.categories c on c.id = t.category_id
where lower(c.name) in ('petrol', 'vehicle')
  and not exists (select 1 from public.garage_entries e where e.transaction_id = t.id);

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
