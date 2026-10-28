-- Trips feed the odometer -----------------------------------------------------------------
-- A trip's end odometer counts as a reading. A trip with a start odometer and a GPS distance
-- but no end odometer gives an estimated reading (start + distance). The estimate is dropped
-- once a real reading is recorded after the trip ended (a later day, or the same day but
-- entered after the trip), so a real reading always wins.
-- Everything that uses garage_readings (Garage card, km reminders, push alerts, Siri,
-- the next trip's start odometer) picks this up.

create or replace view public.garage_readings with (security_invoker = true) as
with real_readings as (
  select e.vehicle_id, coalesce(t.occurred_on, e.occurred_on) as read_on, e.odometer_km as km, 'entry' as source,
         e.created_at as recorded_at
  from public.garage_entries e
  left join public.transactions t on t.id = e.transaction_id
  where e.odometer_km is not null and not e.excluded
  union all
  select o.vehicle_id, o.read_on, o.km, 'manual', o.created_at
  from public.garage_odometer o
  union all
  select tr.vehicle_id, (coalesce(tr.ended_at, tr.started_at) at time zone 'Asia/Kuala_Lumpur')::date, tr.end_odo, 'trip',
         coalesce(tr.ended_at, tr.started_at)
  from public.garage_trips tr
  where tr.end_odo is not null
)
select vehicle_id, read_on, km, source from real_readings
union all
select tr.vehicle_id,
       (tr.ended_at at time zone 'Asia/Kuala_Lumpur')::date,
       (tr.start_odo + round(tr.distance_km))::int,
       'estimate'
from public.garage_trips tr
where tr.end_odo is null
  and tr.start_odo is not null
  and tr.ended_at is not null
  and tr.distance_km > 0
  and not exists (
    select 1 from real_readings r
    where r.vehicle_id = tr.vehicle_id
      and (r.read_on > (tr.ended_at at time zone 'Asia/Kuala_Lumpur')::date
           or (r.read_on = (tr.ended_at at time zone 'Asia/Kuala_Lumpur')::date and r.recorded_at >= tr.ended_at))
  );

revoke all on public.garage_readings from anon;
