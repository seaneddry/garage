import type { Trip } from '../types';

/** The distance actually driven: typed or GPS km, else the odometer difference. */
export function tripKm(t: Trip): number | null {
  if (t.distance_km !== null) return t.distance_km;
  if (t.start_odo !== null && t.end_odo !== null && t.end_odo > t.start_odo) return t.end_odo - t.start_odo;
  return null;
}
