import { supabase } from '../supabase';
import type { Place, Trip, TripExtra } from '../types';
import { kmBetween } from './geo';
import { tripKm } from './trips';

export interface Pt {
  lat: number;
  lng: number;
}

/** A search or map result, before it's saved as a place. */
export interface PlaceHit extends Pt {
  label: string;
  address: string;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('garage-route', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const b = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (b?.error) throw new Error(b.error);
    }
    throw new Error(error.message);
  }
  const out = data as T & { error?: string };
  if (out?.error) throw new Error(out.error);
  return out;
}

export async function searchPlaces(q: string, near: Pt | null): Promise<PlaceHit[]> {
  const r = await call<{ places: PlaceHit[] }>({ action: 'search', q, near });
  return r.places;
}

export async function placeName(p: Pt): Promise<string> {
  const r = await call<{ label: string }>({ action: 'reverse', lat: p.lat, lng: p.lng });
  return r.label;
}

/** Driving distance by road, one way. */
export async function roadKm(from: Pt, to: Pt): Promise<number> {
  const r = await call<{ km: number }>({ action: 'route', from, to });
  return r.km;
}

export function officeOf(places: Place[] | null | undefined): (Pt & { label: string }) | null {
  const o = places?.find((p) => p.kind === 'office');
  return o ? { lat: o.lat, lng: o.lng, label: o.name } : null;
}

/** The saved place a point falls in (its radius), nearest first. */
export function placeAt(places: Place[], pt: Pt, kinds?: Place['kind'][]): Place | null {
  let best: Place | null = null;
  let bestKm = Infinity;
  for (const p of places) {
    if (kinds && !kinds.includes(p.kind)) continue;
    const d = kmBetween(p, pt);
    if (d * 1000 <= p.radius_m && d < bestKm) {
      best = p;
      bestKm = d;
    }
  }
  return best;
}

export interface Suggestion extends Pt {
  trips: number;
}

/**
 * Spots where several trips ended that aren't a saved place yet: likely clients.
 * Greedy clustering of trip ends within 150 m, three or more trips, newest 120 days.
 */
export function suggestPlaces(trips: Trip[], places: Place[], max = 3): Suggestion[] {
  const since = Date.now() - 120 * 86400000;
  const pts: Pt[] = trips
    .filter((t) => t.end_lat !== null && t.end_lng !== null && Date.parse(t.started_at) > since)
    .map((t) => ({ lat: t.end_lat!, lng: t.end_lng! }))
    .filter((pt) => !places.some((p) => kmBetween(p, pt) * 1000 <= Math.max(p.radius_m, 150)));
  const used = new Set<number>();
  const out: Suggestion[] = [];
  while (out.length < max) {
    let bestI = -1;
    let bestN: number[] = [];
    pts.forEach((a, i) => {
      if (used.has(i)) return;
      const near = pts.map((b, j) => (!used.has(j) && kmBetween(a, b) <= 0.15 ? j : -1)).filter((j) => j >= 0);
      if (near.length > bestN.length) {
        bestI = i;
        bestN = near;
      }
    });
    if (bestI < 0 || bestN.length < 3) break;
    bestN.forEach((j) => used.add(j));
    const lat = bestN.reduce((s, j) => s + pts[j].lat, 0) / bestN.length;
    const lng = bestN.reduce((s, j) => s + pts[j].lng, 0) / bestN.length;
    out.push({ lat, lng, trips: bestN.length });
  }
  return out;
}

/**
 * Where a work trip went: whichever end is further from the office. Covers office → client,
 * home → client, client → home and client → office alike. Null when neither end is known,
 * or both ends are at the office.
 */
export function tripDestination(t: Trip, office: Pt): Pt | null {
  if (t.dest_lat !== null && t.dest_lng !== null) return { lat: t.dest_lat, lng: t.dest_lng };
  const ends: Pt[] = [];
  if (t.start_lat !== null && t.start_lng !== null) ends.push({ lat: t.start_lat, lng: t.start_lng });
  if (t.end_lat !== null && t.end_lng !== null) ends.push({ lat: t.end_lat, lng: t.end_lng });
  if (!ends.length) return null;
  const far = ends.reduce((a, b) => (kmBetween(office, b) > kmBetween(office, a) ? b : a));
  return kmBetween(office, far) < 0.3 ? null : far;
}

export interface ClaimFields {
  dest_label: string | null;
  dest_lat: number;
  dest_lng: number;
  office_km: number;
  claim_km: number;
  claim_source: 'office';
}

/** Office ↔ destination by road, ready to save on the trip. */
export async function officeClaim(office: Pt, dest: Pt, label: string | null, roundTrip: boolean): Promise<ClaimFields> {
  const [km, name] = await Promise.all([roadKm(office, dest), label ? Promise.resolve(label) : placeName(dest).catch(() => null)]);
  return {
    dest_label: name,
    dest_lat: dest.lat,
    dest_lng: dest.lng,
    office_km: km,
    claim_km: Math.round(km * (roundTrip ? 2 : 1) * 10) / 10,
    claim_source: 'office',
  };
}

/** The km a work trip claims: the office-based figure once worked out, else the real drive. */
export function claimKm(t: Trip): number | null {
  if (t.purpose !== 'work') return null;
  return t.claim_km ?? tripKm(t);
}

export interface TripClaim {
  km: number;
  mileage: number;
  tolls: number;
  parking: number;
  total: number;
}

/** What a work trip claims in RM: km × rate, plus its tolls and parking. */
export function tripClaim(t: Trip, extras: TripExtra[], rate: number | null): TripClaim {
  const km = claimKm(t) ?? 0;
  const mine = extras.filter((x) => x.trip_id === t.id);
  const tolls = mine.filter((x) => x.kind === 'toll').reduce((s, x) => s + x.amount, 0);
  const parking = mine.filter((x) => x.kind === 'parking').reduce((s, x) => s + x.amount, 0);
  const mileage = rate !== null ? Math.round(km * rate * 100) / 100 : 0;
  return { km, mileage, tolls, parking, total: Math.round((mileage + tolls + parking) * 100) / 100 };
}

/** Toll or parking, from an expense's description. */
export function guessExtraKind(description: string): 'toll' | 'parking' {
  return /park|letak|parkir|carpark|car park/i.test(description) ? 'parking' : 'toll';
}
