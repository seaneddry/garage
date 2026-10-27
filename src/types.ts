export type EntryKind = 'fuel' | 'service' | 'renewal' | 'care' | 'other';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  variant: string | null;
  year: number | null;
  plate: string | null;
  tank_litres: number | null;
  fuel_grade: string | null;
  photo_path: string | null;
  is_default: boolean;
  archived: boolean;
}

export type VehicleInput = Omit<Vehicle, 'id' | 'is_default' | 'archived' | 'photo_path'>;

/** One car cost: a Garage record and/or the Expense Tracker expense it belongs to. */
export interface Cost {
  entry_id: string | null;
  transaction_id: string | null;
  vehicle_id: string | null;
  kind: EntryKind;
  occurred_on: string;
  title: string;
  expense_description: string | null;
  /** Null when the expense was deleted in the Expense Tracker. */
  amount: number | null;
  removed_amount: number | null;
  odometer_km: number | null;
  litres: number | null;
  fuel_grade: string | null;
  full_tank: boolean | null;
  place: string | null;
  notes: string | null;
  cost_removed: boolean;
  needs_details: boolean;
  category: string | null;
}

export interface Reading {
  vehicle_id: string;
  read_on: string;
  km: number;
  source: 'entry' | 'manual';
}

export interface EntryItem {
  name: string;
  amount: number | null;
}

export interface EntryInput {
  id?: string;
  transaction_id?: string | null;
  vehicle_id: string;
  kind: EntryKind;
  occurred_on: string;
  amount: number;
  title: string | null;
  odometer_km: number | null;
  litres: number | null;
  fuel_grade: string | null;
  full_tank: boolean;
  place: string | null;
  notes: string | null;
  items: EntryItem[];
}

export interface Reminder {
  id: string;
  vehicle_id: string;
  name: string;
  every_months: number | null;
  every_km: number | null;
  last_done_on: string | null;
  last_done_km: number | null;
  due_on: string | null;
  alert_days: number;
  match: string | null;
  is_primary: boolean;
  active: boolean;
  notes: string | null;
}

export type ReminderInput = Omit<Reminder, 'id'>;

/** A Vehicle bill or renewal kept in the Expense Tracker's recurring payments. */
export interface ExpenseDue {
  id: string;
  name: string;
  amount: number | null;
  next_due: string | null;
  days_until: number | null;
}

export interface Settings {
  tracking_from: string;
}

export interface Workshop {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  favourite: boolean;
}

export type WorkshopInput = Omit<Workshop, 'id'>;
