// Garage reminder push notifications.
//
// Two ways in:
//  - A signed-in user (browser): action "public-key" or "test".
//  - The daily cron job (header x-cron-secret): action "run".
// Uses the same VAPID keys and cron secret as the Expense Tracker's "push" function
// (public.push_config, readable only by the service role), but Garage's own subscriptions.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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

interface Cfg {
  vapid_public: string;
  vapid_private: string;
  contact: string | null;
  cron_secret: string;
}

async function loadConfig(): Promise<Cfg> {
  const { data, error } = await admin
    .from('push_config')
    .select('vapid_public,vapid_private,contact,cron_secret')
    .eq('id', 1)
    .single();
  if (error || !data) throw new Error('push_config is missing: ' + (error?.message ?? 'no row'));
  if (!data.vapid_public || !data.vapid_private) {
    throw new Error('Push keys are not set up yet. Turn on notifications in the Expense Tracker once.');
  }
  return data as Cfg;
}

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendAll(subs: Sub[], payload: unknown, cfg: Cfg): Promise<number> {
  webpush.setVapidDetails(
    cfg.contact ? `mailto:${cfg.contact}` : 'mailto:notifications@example.com',
    cfg.vapid_public,
    cfg.vapid_private,
  );
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 86400, urgency: 'high' },
      );
      delivered++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await admin.from('garage_push_subscriptions').delete().eq('id', s.id);
      } else {
        console.error('push failed', code, (e as Error).message);
      }
    }
  }
  return delivered;
}

interface Due {
  user_id: string;
  reminder_id: string;
  name: string;
  vehicle: string;
  due_on: string | null;
  due_km: number | null;
  km_left: number | null;
  days_left: number | null;
  stage: 'soon' | 'overdue';
  due_key: string;
}

const km = (n: number) => Math.round(n).toLocaleString('en-MY');
const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function messageFor(d: Due) {
  const parts: string[] = [];
  if (d.km_left !== null) parts.push(d.km_left < 0 ? `${km(-d.km_left)} km past due` : `${km(d.km_left)} km left`);
  if (d.days_left !== null && d.due_on) {
    parts.push(d.days_left < 0 ? `was due ${dateLabel(d.due_on)}` : d.days_left === 0 ? 'due today' : `by ${dateLabel(d.due_on)}`);
  }
  const title = d.stage === 'overdue' ? `${d.name} is overdue` : `${d.name} is due soon`;
  return { title, body: `${d.vehicle}: ${parts.join(', ')}. Tap to book.` };
}

async function runAlerts(cfg: Cfg) {
  const { data, error } = await admin.rpc('garage_due_alerts');
  if (error) throw new Error(error.message);
  const due = (data ?? []) as Due[];

  const byUser = new Map<string, Due[]>();
  for (const d of due) byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), d]);

  let notifications = 0;
  for (const [userId, items] of byUser) {
    const { data: subs } = await admin
      .from('garage_push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('user_id', userId);
    if (!subs || subs.length === 0) continue;

    const payloads =
      items.length <= 3
        ? items.map((d) => ({ ...messageFor(d), url: `book?reminder=${d.reminder_id}`, tag: `garage-${d.reminder_id}`, items: [d] }))
        : [
            {
              title: `${items.length} car jobs coming up`,
              body: items.slice(0, 4).map((d) => d.name).join(', ') + (items.length > 4 ? ' and more' : ''),
              url: 'reminders',
              tag: 'garage-summary',
              items,
            },
          ];

    for (const p of payloads) {
      const { items: covered, ...payload } = p;
      const delivered = await sendAll(subs as Sub[], payload, cfg);
      if (delivered > 0) {
        notifications++;
        await admin
          .from('garage_push_log')
          .upsert(covered.map((d) => ({ reminder_id: d.reminder_id, due_key: d.due_key })), {
            onConflict: 'reminder_id,due_key',
            ignoreDuplicates: true,
          });
      }
    }
  }
  return { due: due.length, users: byUser.size, notifications };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string };

    const secret = req.headers.get('x-cron-secret');
    if (secret) {
      const cfg = await loadConfig();
      if (secret !== cfg.cron_secret) return json({ error: 'Unauthorized' }, 401);
      if (body.action !== 'run') return json({ error: 'Unknown action' }, 400);
      return json(await runAlerts(cfg));
    }

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Unauthorized' }, 401);
    const user = auth.user;
    const cfg = await loadConfig();

    if (body.action === 'public-key') return json({ publicKey: cfg.vapid_public });

    if (body.action === 'test') {
      const { data: subs } = await admin
        .from('garage_push_subscriptions')
        .select('id,endpoint,p256dh,auth')
        .eq('user_id', user.id);
      if (!subs || subs.length === 0) return json({ sent: 0, error: 'This device is not subscribed yet.' });
      const sent = await sendAll(
        subs as Sub[],
        { title: 'Garage alerts are on', body: 'You will get a heads-up before each car job is due.', url: 'reminders', tag: 'garage-test' },
        cfg,
      );
      return json({ sent });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
