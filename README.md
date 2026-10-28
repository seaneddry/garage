# Garage

Service history, fuel and running costs for my cars. A mobile-first PWA in the same
style as the Expense Tracker and My Wardrobe, hosted on GitHub Pages:
https://seaneddry.github.io/garage/

## How it links with the Expense Tracker

Both apps use the same Supabase project. Every cost is stored **once**, as a row in
`transactions` (the Expense Tracker's table). Garage only adds car details in
`garage_entries` (odometer, litres, fuel grade, station or workshop, parts) and points at
that transaction, so amounts and dates can never drift apart.

- Logging in Garage creates the expense and the car record together (`garage_save_entry`).
  Fuel goes to the **Petrol** category, everything else to **Vehicle**.
- Petrol/Vehicle expenses logged in the Expense Tracker (or by Apple Pay) show up in
  Garage automatically. From the "Ask for details from" date in Settings, fuel and service
  ones without car details are flagged **Needs details**.
- Deleting a record in Garage asks whether to delete the expense too. Deleting the expense
  in the Expense Tracker keeps the car details here, marked "Expense deleted".
- "Not for my car" hides a Petrol/Vehicle expense from Garage (a friend's car, a rental).
- Vehicle bills and renewals in the Expense Tracker's recurring payments (road tax, car
  loan) appear under Coming up.

## Reminders, workshops and booking

- Reminders track a job by months, km or both (whichever comes first). A service whose
  name or items match the reminder's words resets it.
- Saved workshops: call, WhatsApp, Waze or Google Maps in one tap.
- Set appointment: pick a workshop and the jobs (due-soon ones are pre-ticked); WhatsApp
  opens with the message written, in English or BM, asking for a price with labour.
- Push alerts: `supabase/functions/garage-push` runs daily at 09:05 Malaysia time
  (cron job `garage-push-alerts`). Each job alerts once when due soon and once when
  overdue; tapping opens the booking screen. It reuses the Expense Tracker's VAPID keys
  but keeps its own subscriptions (`garage_push_subscriptions`), turned on per device in
  Settings → Notifications.

## Receipt scanning

- On the Log screen, **Scan receipt** takes a photo or PDF (fuel receipt, Setel e-receipt,
  workshop invoice). The phone shrinks photos to about 1600 px and re-encodes them, which
  also drops location data. `supabase/functions/garage-scan` sends it to Google Gemini (the
  same `GEMINI_API_KEY` as the Expense Tracker's Ask feature) and returns the date, place,
  odometer, litres, fuel grade, total and invoice lines. Personal numbers are stripped.
  Filled fields are highlighted to check before saving; nothing is saved automatically.
- The camera button on the Odometer row reads the ODO number from a dashboard photo.
- The receipt is kept with the record in the private `garage` bucket
  (`<user>/receipts/YYYY-MM/…`) and can be viewed from the record.
- On an expense that came from the Expense Tracker, scanning fills only empty fields and
  flags it if the receipt total differs from the expense amount.

## Fuel, trips, parking, reports

- **Fuel** (`/fuel`): last-90-days and usual L/100 km, fuel cost per km, average RM/litre,
  12-month charts (spend, L/100 km, RM/litre), a station league (each tank's L/100 km is
  credited to the station that filled it) and every fill-up compared with your usual.
- **Trips** (`/trips`): start a trip in the app (GPS counts only while it's open), or let
  iPhone Shortcuts start and end trips when CarPlay/Bluetooth connects and disconnects.
  Mark trips work or private with a client; monthly claim report as CSV using the claim
  rate in Settings.
- **Trips feed the odometer**: a new trip starts from the latest reading; a trip's end
  odometer counts as a reading; a trip with a start odometer and GPS distance but no end
  odometer gives an estimated reading (shown with ≈), replaced as soon as a real reading is
  entered after the trip.
- **Parking** (`/parking`): "I parked here", bay/level, a photo of the sign, Apple Maps /
  Google Maps / Waze, share. The CarPlay-disconnect Shortcut saves it automatically.
- **Shortcuts & Siri** (Settings → Shortcuts): `supabase/functions/garage-shortcut`
  (no JWT; a per-user token in `garage_settings.shortcut_token`, sent as
  `x-garage-token`). Actions: `trip-start`, `trip-end`, `park`, `odometer`, `next`
  (what's due, as a sentence for Siri). Step-by-step setup is in the app.
- **Service history report** (`/report`): printable, Save as PDF from the print sheet.
- **Part prices** (`/parts`): every invoice line grouped by name with the change vs the
  previous time.
- **Exports**: all costs and all trips as CSV (Settings).

## Database

`supabase/migrations/` (already applied). Phase 1:
`garage_vehicles`, `garage_entries`, `garage_entry_items`, `garage_odometer`,
`garage_reminders`, `garage_settings`, the `garage_costs` and `garage_readings` views,
three RPCs, a trigger on `transactions`, and a private `garage` storage bucket for car photos.
Phase 2 adds `garage_workshops`, `garage_push_subscriptions`, `garage_push_log` and
`garage_due_alerts()`. Phase 3 adds `garage_entries.receipt_path`. Phases 4–6 add `garage_trips`, `garage_parking`,
and `garage_settings.shortcut_token` / `claim_rate`. All tables have row-level security (owner only).

## Fuel use

L/100 km is measured full tank to full tank: the litres added after one full fill-up, up to
and including the next, divided by the km between their odometer readings. Fill-ups
without litres or odometer break the chain rather than give a wrong figure.

## Develop

```
npm install
npm run dev
```

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
The Supabase URL and publishable key are in `.env.production`; both are public by design,
and row-level security protects the data.
