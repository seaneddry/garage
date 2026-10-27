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

## Database

`supabase/migrations/` (already applied). Phase 1:
`garage_vehicles`, `garage_entries`, `garage_entry_items`, `garage_odometer`,
`garage_reminders`, `garage_settings`, the `garage_costs` and `garage_readings` views,
three RPCs, a trigger on `transactions`, and a private `garage` storage bucket for car photos.
Phase 2 adds `garage_workshops`, `garage_push_subscriptions`, `garage_push_log` and
`garage_due_alerts()`. All tables have row-level security (owner only).

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
