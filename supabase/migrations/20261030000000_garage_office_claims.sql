-- Work trip claims measured from the office --------------------------------------------
-- Employers usually pay mileage from the office to the client and back, even on days you
-- set off from home. So a work trip keeps its real drive (distance_km) and, separately, the
-- claimable distance: the road distance between the office and the trip's destination.

alter table public.garage_settings
  add column office_label text,
  add column office_lat   double precision check (office_lat between -90 and 90),
  add column office_lng   double precision check (office_lng between -180 and 180);

alter table public.garage_trips
  add column dest_label   text,
  add column dest_lat     double precision check (dest_lat between -90 and 90),
  add column dest_lng     double precision check (dest_lng between -180 and 180),
  -- One way, office <-> destination, by road. Doubled when claim_return is on.
  add column office_km    numeric(8,1) check (office_km >= 0),
  add column claim_return boolean not null default false,
  -- What goes on the claim. Null = not worked out yet (falls back to the real drive).
  add column claim_km     numeric(8,1) check (claim_km >= 0),
  add column claim_source text check (claim_source in ('office', 'manual'));
