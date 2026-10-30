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
  receipt_path: string | null;
}

export interface Reading {
  vehicle_id: string;
  read_on: string;
  km: number;
  /** entry: a fill-up or service · manual: typed in · trip: a trip's end odometer · estimate: trip start + GPS distance */
  source: 'entry' | 'manual' | 'trip' | 'estimate';
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
  receipt_path?: string | null;
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
  claim_rate: number | null;
  shortcut_token: string | null;
  /** Name printed on the claim form. */
  claim_name: string | null;
}

export type PlaceKind = 'office' | 'home' | 'client' | 'other';

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  /** Road km from the office (clients). */
  office_km: number | null;
}

export type PlaceInput = Omit<Place, 'id'>;

export interface TripExtra {
  id: string;
  trip_id: string;
  transaction_id: string;
  kind: 'toll' | 'parking';
  occurred_on: string;
  description: string;
  amount: number;
}

export interface UnclaimedToll {
  transaction_id: string;
  occurred_on: string;
  description: string;
  amount: number;
}

export interface Trip {
  id: string;
  vehicle_id: string;
  started_at: string;
  ended_at: string | null;
  start_odo: number | null;
  end_odo: number | null;
  distance_km: number | null;
  distance_source: 'gps' | 'odometer' | 'manual' | null;
  purpose: 'private' | 'work';
  client: string | null;
  notes: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  source: 'app' | 'shortcut';
  dest_label: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  /** One way, office to destination, by road. */
  office_km: number | null;
  claim_return: boolean;
  /** What goes on the claim; null until worked out. */
  claim_km: number | null;
  claim_source: 'office' | 'manual' | null;
  place_id: string | null;
  /** Tagged Work because it started or ended at a saved client. */
  auto_tagged: boolean;
}

export type TripInput = Omit<Trip, 'id' | 'source'>;

export interface Parking {
  id: string;
  vehicle_id: string;
  parked_at: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  bay: string | null;
  note: string | null;
  photo_path: string | null;
  source: 'app' | 'shortcut';
}

/** One invoice line with the record it came from, for price history. */
export interface PartLine {
  name: string;
  amount: number | null;
  occurred_on: string;
  place: string | null;
  odometer_km: number | null;
  entry_id: string;
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

/** What the scanner read from a receipt or dashboard photo. Null means not found. */
export interface ScanResult {
  kind?: EntryKind | null;
  date?: string | null;
  place?: string | null;
  plate?: string | null;
  odometer_km: number | null;
  litres?: number | null;
  price_per_litre?: number | null;
  fuel_grade?: string | null;
  total?: number | null;
  items?: EntryItem[];
  found: string[];
}
