// Places and road distances for work-trip claims, using OpenStreetMap services.
//
// In:  { action: 'search',  q, near?: { lat, lng } }  -> { places: [{ label, address, lat, lng }] }
//      { action: 'reverse', lat, lng }                -> { label, address }
//      { action: 'route',   from: { lat, lng }, to: { lat, lng } } -> { km, minutes }
//
// Places come from Photon (OpenStreetMap search), roads from OSRM. Runs here so the services
// get a proper User-Agent and nothing depends on browser CORS. Nothing is stored.
import { createClient } from 'npm:@supabase/supabase-js@2';

const UA = 'Garage personal car log (https://github.com/seaneddry/garage)';
const OSRM = Deno.env.get('GARAGE_OSRM_URL') ?? 'https://router.project-osrm.org';
const PHOTON = Deno.env.get('GARAGE_PHOTON_URL') ?? 'https://photon.komoot.io';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

interface Pt {
  lat: number;
  lng: number;
}

function point(v: unknown): Pt | null {
  const o = v as { lat?: unknown; lng?: unknown } | null;
  const lat = Number(o?.lat);
  const lng = Number(o?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

/** "Menara Ken TTDI, Taman Tun Dr Ismail" rather than the full address. */
function shape(f: PhotonFeature) {
  const p = f.properties;
  const road = p.street ? `${p.housenumber ? `${p.housenumber} ` : ''}${p.street}` : undefined;
  const head = p.name || road || p.district || p.city || 'Dropped pin';
  const area = p.district ?? p.locality ?? p.city ?? p.county ?? p.state;
  const label = [head, area].filter((x, i, all) => x && all.indexOf(x) === i).join(', ');
  const address = [p.name, road, p.district, p.postcode, p.city, p.state]
    .filter((x, i, all) => x && all.indexOf(x) === i)
    .join(', ');
  const [lng, lat] = f.geometry.coordinates;
  return { label, address, lat, lng };
}

async function photon(path: string): Promise<PhotonFeature[]> {
  const res = await fetch(`${PHOTON}${path}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Place search failed (${res.status}). Try again in a moment.`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return body.features ?? [];
}

// Malaysia, so "Jalan Ampang" doesn't find streets abroad.
const MY_BBOX = '99.6,0.85,119.3,7.4';

async function search(q: string, near: Pt | null) {
  const params = new URLSearchParams({ q, limit: '8', lang: 'en', bbox: MY_BBOX });
  if (near) {
    // Rank places around the office first.
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  return (await photon(`/api/?${params}`)).map(shape);
}

async function reverse(p: Pt) {
  const params = new URLSearchParams({ lat: String(p.lat), lon: String(p.lng), lang: 'en', limit: '1' });
  const rows = await photon(`/reverse?${params}`);
  if (!rows.length) return { label: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`, address: '' };
  const r = shape(rows[0]);
  return { label: r.label, address: r.address };
}

async function route(from: Pt, to: Pt) {
  const url = `${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const body = (await res.json().catch(() => null)) as { code?: string; routes?: { distance: number; duration: number }[] } | null;
  if (!res.ok || body?.code !== 'Ok' || !body.routes?.length) {
    throw new Error("Couldn't work out a road route between those places. Enter the claim km by hand.");
  }
  const r = body.routes[0];
  return { km: Math.round(r.distance / 100) / 10, minutes: Math.round(r.duration / 60) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // Signed-in user, or the server's own cron secret (used for health checks).
    const secret = req.headers.get('x-cron-secret');
    if (secret) {
      const { data } = await admin.from('push_config').select('cron_secret').eq('id', 1).single();
      if (!data || secret !== data.cron_secret) return json({ error: 'Unauthorized' }, 401);
    } else {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: auth, error } = await admin.auth.getUser(token);
      if (error || !auth.user) return json({ error: 'Unauthorized' }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    switch (body.action) {
      case 'search': {
        const q = String(body.q ?? '').trim().slice(0, 200);
        if (q.length < 2) return json({ places: [] });
        return json({ places: await search(q, point(body.near)) });
      }
      case 'reverse': {
        const p = point(body);
        if (!p) return json({ error: 'Missing lat/lng.' }, 400);
        return json(await reverse(p));
      }
      case 'route': {
        const from = point(body.from);
        const to = point(body.to);
        if (!from || !to) return json({ error: 'Missing from/to.' }, 400);
        return json(await route(from, to));
      }
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
