-- Garage phases 4-6: trips, parking spots, Shortcuts token, mileage claim rate ------------

alter table public.garage_settings
  add column shortcut_token text unique
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  add column claim_rate numeric(6,2) check (claim_rate >= 0);

update public.garage_settings
   set shortcut_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 where shortcut_token is null;

-- Drives. Started from the app (live GPS while it's open) or by an iPhone Shortcuts
-- automation when the phone connects to the car's CarPlay or Bluetooth.
create table public.garage_trips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id       uuid not null references public.garage_vehicles (id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  start_odo        int check (start_odo >= 0),
  end_odo          int check (end_odo >= 0),
  distance_km      numeric(8,1) check (distance_km >= 0),
  distance_source  text check (distance_source in ('gps', 'odometer', 'manual')),
  purpose          text not null default 'private' check (purpose in ('private', 'work')),
  client           text,
  notes            text,
  start_lat        double precision,
  start_lng        double precision,
  end_lat          double precision,
  end_lng          double precision,
  source           text not null default 'app' check (source in ('app', 'shortcut')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index garage_trips_vehicle_idx on public.garage_trips (vehicle_id, started_at desc);
create trigger garage_trips_set_updated_at before update on public.garage_trips
  for each row execute function public.set_updated_at();

-- Where the car was left. The newest row is the current spot.
create table public.garage_parking (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id  uuid not null references public.garage_vehicles (id) on delete cascade,
  parked_at   timestamptz not null default now(),
  lat         double precision,
  lng         double precision,
  accuracy_m  numeric(8,1),
  bay         text,
  note        text,
  photo_path  text,
  source      text not null default 'app' check (source in ('app', 'shortcut')),
  created_at  timestamptz not null default now()
);
create index garage_parking_vehicle_idx on public.garage_parking (vehicle_id, parked_at desc);

alter table public.garage_trips   enable row level security;
alter table public.garage_parking enable row level security;
create policy "owner access" on public.garage_trips for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.garage_parking for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.garage_trips, public.garage_parking from anon;
