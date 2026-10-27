import type { Cost, EntryKind, Reading } from '../types';

/** A stretch between two full-tank fill-ups: how far the car went and the fuel it took. */
export interface FuelInterval {
  end_on: string;
  km: number;
  litres: number;
  /** Where the tank being measured was filled. */
  start_place: string | null;
  /** The fill-up that closed the interval. */
  end_entry: string | null;
}

/**
 * Full tank to full tank: the litres put in after one full fill-up, up to and including
 * the next full one, cover the distance between their odometer readings. A fill-up with
 * no odometer or litres breaks the chain, so it never produces a wrong figure.
 */
export function fuelIntervals(costs: Cost[]): FuelInterval[] {
  const fills = costs
    .filter((c) => c.kind === 'fuel')
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || (a.odometer_km ?? 0) - (b.odometer_km ?? 0));
  const out: FuelInterval[] = [];
  let startOdo: number | null = null;
  let startPlace: string | null = null;
  let litres = 0;
  for (const f of fills) {
    if (f.litres === null || f.odometer_km === null) {
      startOdo = null;
      litres = 0;
      continue;
    }
    if (startOdo !== null) {
      litres += f.litres;
      if (f.full_tank !== false && f.odometer_km > startOdo) {
        out.push({ end_on: f.occurred_on, km: f.odometer_km - startOdo, litres, start_place: startPlace, end_entry: f.entry_id });
      }
    }
    if (f.full_tank !== false) {
      startOdo = f.odometer_km;
      startPlace = f.place;
      litres = 0;
    }
  }
  return out;
}

/** Litres per 100 km over a set of intervals, or null when there is nothing to measure. */
export function per100(intervals: FuelInterval[]): number | null {
  const km = intervals.reduce((s, i) => s + i.km, 0);
  const l = intervals.reduce((s, i) => s + i.litres, 0);
  return km > 0 ? (l / km) * 100 : null;
}

/** Highest odometer reading on or before a date. */
export function readingOn(readings: Reading[], date: string): number | null {
  let best: number | null = null;
  for (const r of readings) if (r.read_on <= date && (best === null || r.km > best)) best = r.km;
  return best;
}

export function latestReading(readings: Reading[]): { km: number; on: string } | null {
  let best: Reading | null = null;
  for (const r of readings) if (!best || r.km > best.km) best = r;
  return best ? { km: best.km, on: best.read_on } : null;
}

export type Period = { from: string; to: string }; // to is exclusive

export function monthPeriod(monthStart: string): Period {
  const [y, m] = monthStart.split('-').map(Number);
  return { from: monthStart, to: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) };
}

export function yearPeriod(year: number): Period {
  return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface PeriodStats {
  distance: number | null;
  fuelCost: number;
  litres: number;
  fills: number;
  per100: number | null;
  fuelPerKm: number | null;
  byKind: Record<EntryKind, number>;
  otherCost: number;
  total: number;
  count: number;
}

export function periodStats(costs: Cost[], readings: Reading[], intervals: FuelInterval[], p: Period): PeriodStats {
  const inP = costs.filter((c) => c.occurred_on >= p.from && c.occurred_on < p.to);
  const byKind: Record<EntryKind, number> = { fuel: 0, service: 0, renewal: 0, care: 0, other: 0 };
  let litres = 0;
  let fills = 0;
  for (const c of inP) {
    byKind[c.kind] += c.amount ?? 0;
    if (c.kind === 'fuel') {
      fills += 1;
      litres += c.litres ?? 0;
    }
  }
  const start = readingOn(readings, dayBefore(p.from));
  const end = readingOn(readings, dayBefore(p.to));
  const distance = start !== null && end !== null && end > start ? end - start : null;
  const fuelCost = byKind.fuel;
  const otherCost = byKind.service + byKind.renewal + byKind.care + byKind.other;
  return {
    distance,
    fuelCost,
    litres,
    fills,
    per100: per100(intervals.filter((i) => i.end_on >= p.from && i.end_on < p.to)),
    fuelPerKm: distance ? fuelCost / distance : null,
    byKind,
    otherCost,
    total: fuelCost + otherCost,
    count: inP.length,
  };
}

/** Change from the previous period as a fraction (0.12 = 12% more), or null when not comparable. */
export function change(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return (now - before) / before;
}
