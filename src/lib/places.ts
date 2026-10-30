import { supabase } from '../supabase';
import type { Settings, Trip } from '../types';
import { kmBetween } from './geo';
import { tripKm } from './trips';

export interface Pt {
  lat: number;
  lng: number;
}

export interface Place extends Pt {
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

export async function searchPlaces(q: string, near: Pt | null): Promise<Place[]> {
  const r = await call<{ places: Place[] }>({ action: 'search', q, near });
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

export function officeOf(s: Settings | null | undefined): (Pt & { label: string }) | null {
  return s && s.office_lat !== null && s.office_lng !== null
    ? { lat: s.office_lat, lng: s.office_lng, label: s.office_label || 'Office' }
    : null;
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
