import { supabase } from './supabase';
import type { Cost, EntryInput, EntryItem, ExpenseDue, Reading, Reminder, ReminderInput, Settings, Vehicle, VehicleInput, Workshop, WorkshopInput } from './types';

function fail(error: { message: string } | null): never | void {
  if (error) throw new Error(error.message);
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ------------------------------------------------------------------ vehicles
const VEHICLE_COLS = 'id,make,model,variant,year,plate,tank_litres,fuel_grade,photo_path,is_default,archived';

export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('garage_vehicles')
    .select(VEHICLE_COLS)
    .order('is_default', { ascending: false })
    .order('created_at');
  fail(error);
  return (data ?? []).map((v) => ({ ...v, tank_litres: num(v.tank_litres) })) as Vehicle[];
}

export async function saveVehicle(id: string | null, input: VehicleInput, makeDefault: boolean): Promise<string> {
  if (id) {
    const { error } = await supabase.from('garage_vehicles').update(input).eq('id', id);
    fail(error);
    return id;
  }
  const { data, error } = await supabase
    .from('garage_vehicles')
    .insert({ ...input, is_default: makeDefault })
    .select('id')
    .single();
  fail(error);
  return data!.id as string;
}

export async function setDefaultVehicle(id: string): Promise<void> {
  const off = await supabase.from('garage_vehicles').update({ is_default: false }).eq('is_default', true);
  fail(off.error);
  const { error } = await supabase.from('garage_vehicles').update({ is_default: true }).eq('id', id);
  fail(error);
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('garage_vehicles').delete().eq('id', id);
  fail(error);
}

// --------------------------------------------------------------- car photos
async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Signed out. Sign in again.');
  return id;
}

export async function uploadVehiclePhoto(vehicle: Vehicle, file: File): Promise<void> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${await userId()}/vehicles/${vehicle.id}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from('garage').upload(path, file, { contentType: file.type, upsert: false });
  fail(up.error);
  const { error } = await supabase.from('garage_vehicles').update({ photo_path: path }).eq('id', vehicle.id);
  fail(error);
  if (vehicle.photo_path) await supabase.storage.from('garage').remove([vehicle.photo_path]);
}

export async function removeVehiclePhoto(vehicle: Vehicle): Promise<void> {
  const { error } = await supabase.from('garage_vehicles').update({ photo_path: null }).eq('id', vehicle.id);
  fail(error);
  if (vehicle.photo_path) await supabase.storage.from('garage').remove([vehicle.photo_path]);
}

const photoCache = new Map<string, { url: string; at: number }>();

/** Signed URL for a private car photo, cached for 50 minutes. */
export async function vehiclePhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const hit = photoCache.get(path);
  if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
  const { data, error } = await supabase.storage.from('garage').createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  photoCache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

// -------------------------------------------------------------------- costs
const COST_COLS =
  'entry_id,transaction_id,vehicle_id,kind,occurred_on,title,expense_description,amount,removed_amount,odometer_km,litres,fuel_grade,full_tank,place,notes,cost_removed,needs_details,category';

function toCost(r: Record<string, unknown>): Cost {
  return {
    ...(r as unknown as Cost),
    amount: num(r.amount),
    removed_amount: num(r.removed_amount),
    odometer_km: num(r.odometer_km),
    litres: num(r.litres),
  };
}

/** Every cost for one car, newest first. */
export async function listCosts(vehicleId: string): Promise<Cost[]> {
  const { data, error } = await supabase
    .from('garage_costs')
    .select(COST_COLS)
    .eq('vehicle_id', vehicleId)
    .order('occurred_on', { ascending: false })
    .limit(5000);
  fail(error);
  return (data ?? []).map(toCost);
}

export async function getCostByEntry(entryId: string): Promise<Cost | null> {
  const { data, error } = await supabase.from('garage_costs').select(COST_COLS).eq('entry_id', entryId).maybeSingle();
  fail(error);
  return data ? toCost(data) : null;
}

export async function getCostByTransaction(transactionId: string): Promise<Cost | null> {
  const { data, error } = await supabase
    .from('garage_costs')
    .select(COST_COLS)
    .eq('transaction_id', transactionId)
    .maybeSingle();
  fail(error);
  return data ? toCost(data) : null;
}

export async function listEntryItems(entryId: string): Promise<EntryItem[]> {
  const { data, error } = await supabase
    .from('garage_entry_items')
    .select('name,amount')
    .eq('entry_id', entryId)
    .order('sort');
  fail(error);
  return (data ?? []).map((i) => ({ name: i.name as string, amount: num(i.amount) }));
}

export async function saveEntry(input: EntryInput): Promise<string> {
  const { data, error } = await supabase.rpc('garage_save_entry', { p: input });
  fail(error);
  return data as string;
}

export async function deleteEntry(entryId: string, deleteExpense: boolean): Promise<void> {
  const { error } = await supabase.rpc('garage_delete_entry', { p_id: entryId, p_delete_expense: deleteExpense });
  fail(error);
}

/** Mark a Petrol/Vehicle expense as not for any of your cars. */
export async function setExcluded(transactionId: string, excluded: boolean): Promise<void> {
  const { error } = await supabase.rpc('garage_set_excluded', { p_transaction_id: transactionId, p_excluded: excluded });
  fail(error);
}

/** Places typed before, most used first (powers autocomplete). */
export async function listPlaces(): Promise<string[]> {
  const { data, error } = await supabase.from('garage_entries').select('place').not('place', 'is', null).limit(1000);
  fail(error);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.place as string, (counts.get(r.place as string) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

// ----------------------------------------------------------------- odometer
export async function listReadings(vehicleId: string): Promise<Reading[]> {
  const { data, error } = await supabase
    .from('garage_readings')
    .select('vehicle_id,read_on,km,source')
    .eq('vehicle_id', vehicleId)
    .order('read_on');
  fail(error);
  return (data ?? []).map((r) => ({ ...(r as Reading), km: Number(r.km) }));
}

export async function addReading(vehicleId: string, readOn: string, km: number): Promise<void> {
  const { error } = await supabase.from('garage_odometer').insert({ vehicle_id: vehicleId, read_on: readOn, km });
  fail(error);
}

// ---------------------------------------------------------------- reminders
const REMINDER_COLS =
  'id,vehicle_id,name,every_months,every_km,last_done_on,last_done_km,due_on,alert_days,match,is_primary,active,notes';

export async function listReminders(vehicleId: string): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('garage_reminders')
    .select(REMINDER_COLS)
    .eq('vehicle_id', vehicleId)
    .order('is_primary', { ascending: false })
    .order('name');
  fail(error);
  return (data ?? []) as Reminder[];
}

export async function getReminder(id: string): Promise<Reminder | null> {
  const { data, error } = await supabase.from('garage_reminders').select(REMINDER_COLS).eq('id', id).maybeSingle();
  fail(error);
  return (data as Reminder) ?? null;
}

export async function saveReminder(id: string | null, input: ReminderInput): Promise<void> {
  if (input.is_primary) {
    const off = await supabase
      .from('garage_reminders')
      .update({ is_primary: false })
      .eq('vehicle_id', input.vehicle_id)
      .eq('is_primary', true)
      .neq('id', id ?? '00000000-0000-0000-0000-000000000000');
    fail(off.error);
  }
  const res = id
    ? await supabase.from('garage_reminders').update(input).eq('id', id)
    : await supabase.from('garage_reminders').insert(input);
  fail(res.error);
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from('garage_reminders').delete().eq('id', id);
  fail(error);
}

/** Vehicle bills and renewals from the Expense Tracker's recurring payments (road tax, car loan…). */
export async function listExpenseDues(): Promise<ExpenseDue[]> {
  const { data, error } = await supabase
    .from('recurring_overview')
    .select('id,name,amount,next_due,days_until,status,category')
    .eq('status', 'active')
    .ilike('category', 'vehicle')
    .order('next_due');
  fail(error);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    amount: num(r.amount),
    next_due: r.next_due as string | null,
    days_until: num(r.days_until),
  }));
}

// ----------------------------------------------------------------- settings
export async function getSettings(): Promise<Settings | null> {
  const { data, error } = await supabase.from('garage_settings').select('tracking_from').maybeSingle();
  fail(error);
  return (data as Settings) ?? null;
}

export async function saveSettings(input: Settings): Promise<void> {
  const { error } = await supabase.from('garage_settings').upsert({ ...input, user_id: await userId() });
  fail(error);
}

// ---------------------------------------------------------------- workshops
const WORKSHOP_COLS = 'id,name,phone,address,notes,favourite';

export async function listWorkshops(): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from('garage_workshops')
    .select(WORKSHOP_COLS)
    .order('favourite', { ascending: false })
    .order('name');
  fail(error);
  return (data ?? []) as Workshop[];
}

export async function getWorkshop(id: string): Promise<Workshop | null> {
  const { data, error } = await supabase.from('garage_workshops').select(WORKSHOP_COLS).eq('id', id).maybeSingle();
  fail(error);
  return (data as Workshop) ?? null;
}

export async function saveWorkshop(id: string | null, input: WorkshopInput): Promise<string> {
  if (id) {
    const { error } = await supabase.from('garage_workshops').update(input).eq('id', id);
    fail(error);
    return id;
  }
  const { data, error } = await supabase.from('garage_workshops').insert(input).select('id').single();
  fail(error);
  return data!.id as string;
}

export async function deleteWorkshop(id: string): Promise<void> {
  const { error } = await supabase.from('garage_workshops').delete().eq('id', id);
  fail(error);
}
