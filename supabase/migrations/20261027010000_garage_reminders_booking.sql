-- Garage phase 2: saved workshops, reminder push alerts --------------------------------

-- Workshops, tyre shops and other contacts -----------------------------------------------
create table public.garage_workshops (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  phone       text,
  address     text,
  notes       text,
  favourite   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger garage_workshops_set_updated_at before update on public.garage_workshops
  for each row execute function public.set_updated_at();
alter table public.garage_workshops enable row level security;
create policy "owner access" on public.garage_workshops for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.garage_workshops from anon;

-- Garage's own push subscriptions. Kept apart from the Expense Tracker's because each
-- Home Screen app on an iPhone gets its own subscription, and a tap must open Garage.
create table public.garage_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.garage_push_subscriptions enable row level security;
create policy "owner access" on public.garage_push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.garage_push_subscriptions from anon;

-- Which alerts were already sent: once when a job becomes due soon, once when overdue,
-- for each due date/odometer. Logging a service moves the due point, so alerts start over.
create table public.garage_push_log (
  reminder_id uuid not null references public.garage_reminders (id) on delete cascade,
  due_key     text not null,
  sent_at     timestamptz not null default now(),
  primary key (reminder_id, due_key)
);
alter table public.garage_push_log enable row level security;
revoke all on public.garage_push_log from anon, authenticated;

-- Reminders that are due soon or overdue and not yet notified. Mirrors src/lib/reminders.ts.
create or replace function public.garage_due_alerts()
returns table (user_id uuid, reminder_id uuid, name text, vehicle text, due_on date, due_km int,
               km_left int, days_left int, stage text, due_key text)
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select vehicle_id, read_on, km from public.garage_readings
  ),
  latest as (
    select distinct on (vehicle_id) vehicle_id, read_on, km
    from r order by vehicle_id, km desc, read_on desc
  ),
  earliest as (
    select distinct on (r.vehicle_id) r.vehicle_id, r.read_on, r.km
    from r join latest l on l.vehicle_id = r.vehicle_id
    where r.read_on >= l.read_on - 90 and r.read_on < l.read_on
    order by r.vehicle_id, r.read_on
  ),
  pace as (
    select l.vehicle_id, l.km as cur_km,
           case when e.read_on is not null and l.read_on > e.read_on and l.km > e.km
                then (l.km - e.km)::numeric / (l.read_on - e.read_on) end as km_per_day
    from latest l left join earliest e on e.vehicle_id = l.vehicle_id
  ),
  s as (
    select g.user_id, g.id, g.name, trim(v.make || ' ' || v.model) as vehicle, g.alert_days, g.every_km,
           coalesce(g.due_on,
                    case when g.last_done_on is not null and g.every_months is not null
                         then (g.last_done_on + make_interval(months => g.every_months))::date end) as due_on,
           case when g.last_done_km is not null and g.every_km is not null
                then g.last_done_km + g.every_km end as due_km,
           p.cur_km, p.km_per_day
    from public.garage_reminders g
    join public.garage_vehicles v on v.id = g.vehicle_id
    left join pace p on p.vehicle_id = g.vehicle_id
    where g.active and not v.archived
  ),
  c as (
    select s.*, (s.due_on - public.kl_today())::int as days_left, (s.due_km - s.cur_km)::int as km_left
    from s
  ),
  staged as (
    select c.*,
           case
             when (c.days_left is not null and c.days_left < 0) or (c.km_left is not null and c.km_left < 0) then 'overdue'
             when (c.days_left is not null and c.days_left <= c.alert_days)
               or (c.km_left is not null and c.km_left <= greatest(500, coalesce(c.every_km, 0) * 0.1))
               or (c.km_left is not null and c.km_per_day > 0 and c.km_left / c.km_per_day <= c.alert_days) then 'soon'
           end as stage
    from c
  )
  select st.user_id, st.id, st.name, st.vehicle, st.due_on, st.due_km, st.km_left, st.days_left, st.stage,
         st.stage || '|' || coalesce(st.due_on::text, '') || '|' || coalesce(st.due_km::text, '')
  from staged st
  where st.stage is not null
    and not exists (
      select 1 from public.garage_push_log l
      where l.reminder_id = st.id
        and l.due_key = st.stage || '|' || coalesce(st.due_on::text, '') || '|' || coalesce(st.due_km::text, ''))
    and exists (select 1 from public.garage_push_subscriptions x where x.user_id = st.user_id)
  order by st.days_left nulls last;
$$;

revoke execute on function public.garage_due_alerts() from public, anon, authenticated;
grant  execute on function public.garage_due_alerts() to service_role;

-- Every day at 09:05 Malaysia time (01:05 UTC), right after the Expense Tracker's alerts.
-- Same pattern as that job: the anon key only passes the gateway, x-cron-secret authorises.
select cron.schedule(
  'garage-push-alerts',
  '5 1 * * *',
  $cmd$
  select net.http_post(
    url     := 'https://sqtfdpxhtnspdnthabwj.supabase.co/functions/v1/garage-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGZkcHhodG5zcGRudGhhYndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDQyMDksImV4cCI6MjEwNzAyMDIwOX0._Zv9tc36cUmLc_RInmJjke_Q3s0MW6E-xq49L3qd7JI',
      'x-cron-secret', (select cron_secret from public.push_config where id = 1)),
    body    := jsonb_build_object('action', 'run'));
  $cmd$
);
