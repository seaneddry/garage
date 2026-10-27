// Endpoint for iPhone Shortcuts and Siri. Each person has their own secret token, shown in
// Garage → Settings → Shortcuts, sent in the "x-garage-token" header.
//
// POST { action, lat?, lng?, km?, bay? }  — or GET ?action=next
//   trip-start  CarPlay/Bluetooth connected: starts a trip for the main car.
//   trip-end    Disconnected: ends the open trip and saves where you parked.
//   park        Saves where you parked.
//   odometer    Adds an odometer reading: { km }.
//   next        What's due next, as one sentence for Siri to read out.
// Replies are short plain text, so a Shortcut can show or speak them as they are.
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });

const kmFmt = (n: number) => Math.round(n).toLocaleString('en-MY');

function klToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function coords(body: Record<string, unknown>): { lat: number | null; lng: number | null } {
  // Shortcuts can send a Location as "lat,lng" text or as separate numbers.
  if (typeof body.location === 'string' && body.location.includes(',')) {
    const [a, b] = body.location.split(',').map((s) => Number(s.trim()));
    if (Number.isFinite(a) && Number.isFinite(b)) return { lat: a, lng: b };
  }
  const lat = num(body.lat);
  const lng = num(body.lng);
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : { lat: null, lng: null };
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

async function latestKm(vehicleId: string): Promise<number | null> {
  const { data } = await db.from('garage_readings').select('km').eq('vehicle_id', vehicleId).order('km', { ascending: false }).limit(1);
  return data && data.length ? Number(data[0].km) : null;
}

async function whatsDue(vehicleId: string, carName: string): Promise<string> {
  const { data: reminders } = await db
    .from('garage_reminders')
    .select('name,every_months,every_km,last_done_on,last_done_km,due_on')
    .eq('vehicle_id', vehicleId)
    .eq('active', true);
  const current = await latestKm(vehicleId);
  const today = klToday();
  const rows = (reminders ?? [])
    .map((r) => {
      const dueOn = r.due_on ?? (r.last_done_on && r.every_months ? addMonths(r.last_done_on, r.every_months) : null);
      const days = dueOn ? daysBetween(today, dueOn) : null;
      const dueKm = r.last_done_km !== null && r.every_km ? r.last_done_km + r.every_km : null;
      const kmLeft = dueKm !== null && current !== null ? dueKm - current : null;
      const parts: string[] = [];
      if (kmLeft !== null) parts.push(kmLeft < 0 ? `${kmFmt(-kmLeft)} km overdue` : `${kmFmt(kmLeft)} km left`);
      if (days !== null) parts.push(days < 0 ? `${-days} days overdue` : days === 0 ? 'due today' : `${days} days left`);
      return { name: r.name as string, parts, sortKey: Math.min(days ?? 99999, kmLeft !== null ? kmLeft / 40 : 99999) };
    })
    .filter((r) => r.parts.length > 0)
    .sort((a, b) => a.sortKey - b.sortKey);
  if (rows.length === 0) return `Nothing is scheduled for the ${carName} yet. Set reminder intervals in Garage.`;
  const [first, ...rest] = rows;
  let out = `${first.name}: ${first.parts.join(', ')}.`;
  if (rest.length) out += ` Then ${rest[0].name}: ${rest[0].parts.join(', ')}.`;
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-garage-token',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const token = (req.headers.get('x-garage-token') ?? '').trim();
    if (token.length < 32) return text('Missing token. Copy it from Garage → Settings → Shortcuts.', 401);

    const { data: settings } = await db.from('garage_settings').select('user_id').eq('shortcut_token', token).maybeSingle();
    if (!settings) return text('That token is not valid any more. Copy the current one from Garage → Settings → Shortcuts.', 401);
    const userId = settings.user_id as string;

    const body: Record<string, unknown> =
      req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : Object.fromEntries(url.searchParams);
    const action = String(body.action ?? url.searchParams.get('action') ?? '').trim();

    const { data: vehicle } = await db
      .from('garage_vehicles')
      .select('id,make,model,plate')
      .eq('user_id', userId)
      .eq('archived', false)
      .order('is_default', { ascending: false })
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (!vehicle) return text('Add your car in Garage first.', 400);
    const carName = (vehicle.model as string) || 'car';
    const { lat, lng } = coords(body);

    if (action === 'trip-start') {
      const now = new Date().toISOString();
      // A trip left open (the disconnect automation didn't run) is closed first.
      await db
        .from('garage_trips')
        .update({ ended_at: now, notes: 'Closed automatically when the next trip started.' })
        .eq('vehicle_id', vehicle.id)
        .is('ended_at', null);
      const startOdo = await latestKm(vehicle.id);
      const { error } = await db.from('garage_trips').insert({
        user_id: userId,
        vehicle_id: vehicle.id,
        started_at: now,
        start_odo: startOdo,
        start_lat: lat,
        start_lng: lng,
        source: 'shortcut',
      });
      if (error) throw new Error(error.message);
      return text(`Trip started in the ${carName}.`);
    }

    if (action === 'trip-end' || action === 'park') {
      let reply = '';
      if (action === 'trip-end') {
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: open } = await db
          .from('garage_trips')
          .select('id,started_at')
          .eq('vehicle_id', vehicle.id)
          .is('ended_at', null)
          .gte('started_at', since)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (open) {
          await db.from('garage_trips').update({ ended_at: new Date().toISOString(), end_lat: lat, end_lng: lng }).eq('id', open.id);
          const mins = Math.max(1, Math.round((Date.now() - Date.parse(open.started_at as string)) / 60000));
          reply = `Trip saved, ${mins} min. `;
        } else {
          reply = 'No open trip found. ';
        }
      }
      if (lat !== null && lng !== null) {
        const { error } = await db.from('garage_parking').insert({
          user_id: userId,
          vehicle_id: vehicle.id,
          lat,
          lng,
          bay: typeof body.bay === 'string' && body.bay.trim() ? body.bay.trim().slice(0, 60) : null,
          source: 'shortcut',
        });
        if (error) throw new Error(error.message);
        reply += 'Parking spot saved.';
      } else {
        reply += 'No location was sent, so the parking spot was not saved.';
      }
      return text(reply.trim());
    }

    if (action === 'odometer') {
      const km = num(body.km);
      if (km === null || km < 0 || km > 2_000_000) return text('Send the odometer in km, for example 49700.', 400);
      const { error } = await db
        .from('garage_odometer')
        .insert({ user_id: userId, vehicle_id: vehicle.id, read_on: klToday(), km: Math.round(km) });
      if (error) throw new Error(error.message);
      return text(`Odometer ${kmFmt(km)} km saved.`);
    }

    if (action === 'next' || action === '') {
      return text(await whatsDue(vehicle.id, carName));
    }

    return text(`Unknown action "${action}". Use trip-start, trip-end, park, odometer or next.`, 400);
  } catch (e) {
    console.error(e);
    return text('Something went wrong. Try again in a moment.', 500);
  }
});
