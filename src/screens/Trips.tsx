import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { getSettings, listReadings, listTrips, saveTrip } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { addMonths, monthLabel, monthStart, rm, todayKL } from '../lib/format';
import { latestReading, monthPeriod } from '../lib/stats';
import { currentFix, klDate, minutesBetween, timeLabel, watchDistance } from '../lib/geo';
import { shareOrDownload, toCsv } from '../lib/csv';
import type { Trip } from '../types';

const LIVE_KEY = 'garage.liveTrip';

interface Live {
  id: string;
  startedAt: string;
  km: number;
}

function readLive(): Live | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    return raw ? (JSON.parse(raw) as Live) : null;
  } catch {
    return null;
  }
}

function writeLive(v: Live | null) {
  try {
    if (v) localStorage.setItem(LIVE_KEY, JSON.stringify(v));
    else localStorage.removeItem(LIVE_KEY);
  } catch {
    /* private mode: the trip still saves when stopped */
  }
}

export function tripKm(t: Trip): number | null {
  if (t.distance_km !== null) return t.distance_km;
  if (t.start_odo !== null && t.end_odo !== null && t.end_odo > t.start_odo) return t.end_odo - t.start_odo;
  return null;
}

export function Trips() {
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { vehicle } = useVehicle();
  const vid = vehicle?.id ?? '';
  const trips = useQuery(() => (vid ? listTrips(vid) : Promise.resolve([] as Trip[])), [vid]);
  const settings = useQuery(getSettings, []);
  const readings = useQuery(() => (vid ? listReadings(vid) : Promise.resolve([])), [vid]);
  const [month, setMonth] = useState(monthStart(todayKL()));

  // ----- live GPS trip (only while the app is open)
  const [live, setLive] = useState<Live | null>(readLive);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stopWatch = useRef<(() => void) | null>(null);
  const lastFix = useRef<{ lat: number; lng: number } | null>(null);
  const lastSaved = useRef(0);

  useEffect(() => {
    if (!live) return;
    const base = live.km;
    stopWatch.current = watchDistance(
      (kmSoFar, fix) => {
        lastFix.current = fix;
        const next = { ...live, km: base + kmSoFar };
        setLive(next);
        writeLive(next);
        // Save progress now and then, so a closed app doesn't lose the whole distance.
        if (Date.now() - lastSaved.current > 60000) {
          lastSaved.current = Date.now();
          void saveTrip(live.id, { distance_km: Math.round(next.km * 10) / 10, distance_source: 'gps' }).catch(() => {});
        }
      },
      (e) => setGpsError(e.message),
    );
    return () => stopWatch.current?.();
    // Restart the watch only when a different trip starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.id]);

  async function start() {
    if (!vehicle) return;
    setBusy(true);
    setGpsError(null);
    try {
      const fix = await currentFix();
      const startOdo = latestReading(readings.data ?? [])?.km ?? null;
      const id = await saveTrip(null, {
        vehicle_id: vehicle.id,
        started_at: new Date().toISOString(),
        start_lat: fix.lat,
        start_lng: fix.lng,
        start_odo: startOdo,
        distance_km: 0,
        distance_source: 'gps',
        purpose: 'private',
      });
      const next = { id, startedAt: new Date().toISOString(), km: 0 };
      writeLive(next);
      setLive(next);
      bump();
    } catch (e) {
      setGpsError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!live) return;
    setBusy(true);
    stopWatch.current?.();
    try {
      const end = lastFix.current ?? (await currentFix().catch(() => null));
      await saveTrip(live.id, {
        ended_at: new Date().toISOString(),
        distance_km: Math.round(live.km * 10) / 10,
        distance_source: 'gps',
        end_lat: end?.lat ?? null,
        end_lng: end?.lng ?? null,
      });
      const id = live.id;
      writeLive(null);
      setLive(null);
      bump();
      toast(`Trip saved · ${live.km.toFixed(1)} km`);
      navigate(`/trips/${id}`);
    } catch (e) {
      setGpsError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // ----- month view
  const period = monthPeriod(month);
  const inMonth = useMemo(
    () => (trips.data ?? []).filter((t) => klDate(t.started_at) >= period.from && klDate(t.started_at) < period.to),
    [trips.data, period.from, period.to],
  );
  const totalKm = inMonth.reduce((s, t) => s + (tripKm(t) ?? 0), 0);
  const work = inMonth.filter((t) => t.purpose === 'work');
  const workKm = work.reduce((s, t) => s + (tripKm(t) ?? 0), 0);
  const rate = settings.data?.claim_rate ?? null;
  const missingKm = work.filter((t) => tripKm(t) === null).length;
  const atEnd = month >= monthStart(todayKL());

  async function exportMonth() {
    const rows: (string | number | null)[][] = [
      ['Date', 'Start', 'End', 'Minutes', 'Distance (km)', 'Distance from', 'Purpose', 'Client / category', 'Start odometer', 'End odometer', `Claim (RM${rate !== null ? ` @ ${rate}/km` : ''})`, 'Notes'],
    ];
    for (const t of [...inMonth].reverse()) {
      const d = tripKm(t);
      rows.push([
        klDate(t.started_at),
        timeLabel(t.started_at),
        t.ended_at ? timeLabel(t.ended_at) : '',
        minutesBetween(t.started_at, t.ended_at),
        d !== null ? d.toFixed(1) : '',
        t.distance_source ?? (t.start_odo !== null && t.end_odo !== null ? 'odometer' : ''),
        t.purpose,
        t.client,
        t.start_odo,
        t.end_odo,
        t.purpose === 'work' && rate !== null && d !== null ? (d * rate).toFixed(2) : '',
        t.notes,
      ]);
    }
    rows.push([]);
    rows.push(['Work total', '', '', '', workKm.toFixed(1), '', '', '', '', '', rate !== null ? (workKm * rate).toFixed(2) : '', '']);
    await shareOrDownload(`trips-${month.slice(0, 7)}.csv`, toCsv(rows));
  }

  return (
    <Screen
      title="Trips"
      compact
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} />
          Back
        </button>
      }
      right={
        <Link to="/trips/new" className="nav-button" aria-label="Add a trip by hand">
          <Icon name="plus" size={22} />
        </Link>
      }
    >
      <main className="page stack">
        <section className={`live-trip ${live ? 'is-live' : ''}`}>
          {live ? (
            <>
              <div className="live-top">
                <span className="live-dot" aria-hidden="true" />
                <span>Trip in progress · since {timeLabel(live.startedAt).split(', ')[1]}</span>
              </div>
              <div className="live-km num">{live.km.toFixed(1)} km</div>
              <div className="live-note">GPS counts only while Garage is open on screen. For hands-free trips, use the CarPlay Shortcut.</div>
              <button className="button button-primary button-block" disabled={busy} onClick={stop}>
                {busy ? 'Saving…' : 'End trip'}
              </button>
            </>
          ) : (
            <>
              <div className="live-top">
                <Icon name="gauge" size={18} />
                <span>Measure a drive with GPS</span>
              </div>
              <button className="button button-primary button-block" disabled={busy || !vehicle} onClick={start}>
                {busy ? 'Getting location…' : 'Start trip'}
              </button>
              <Link to="/settings/shortcuts" className="live-note link-clean">
                Or start and end trips automatically when your phone connects to CarPlay ›
              </Link>
            </>
          )}
          {gpsError ? (
            <div className="notice notice-error" role="alert">
              {gpsError}
            </div>
          ) : null}
        </section>

        <div className="stats-switch">
          <button className="round-button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <Icon name="chevron-left" size={20} />
          </button>
          <strong>{monthLabel(month)}</strong>
          <button className="round-button" aria-label="Next month" disabled={atEnd} onClick={() => setMonth(addMonths(month, 1))}>
            <Icon name="chevron-right" size={20} />
          </button>
        </div>

        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">Trips</div>
            <div className="kpi-value num">{inMonth.length}</div>
            <div className="kpi-note">{totalKm > 0 ? `${totalKm.toFixed(0)} km` : 'no distance yet'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Work</div>
            <div className="kpi-value num">{workKm.toFixed(0)} km</div>
            <div className="kpi-note">
              {rate !== null ? `claim ${rm(workKm * rate)}` : <Link to="/settings">set claim rate</Link>}
            </div>
          </div>
        </div>
        {missingKm > 0 ? (
          <div className="notice notice-warn">
            {missingKm} work trip{missingKm === 1 ? ' has' : 's have'} no distance. Open {missingKm === 1 ? 'it' : 'them'} and add the km or odometer.
          </div>
        ) : null}

        {trips.error ? <ErrorNotice message={trips.error} onRetry={trips.reload} /> : null}
        {!trips.data && !trips.error ? <Loading /> : null}
        {trips.data && inMonth.length === 0 ? (
          <Empty icon="car" title="No trips this month" text="Start one above, set up the CarPlay Shortcut, or add one by hand." />
        ) : null}

        {inMonth.length > 0 ? (
          <section className="group">
            <div className="group-body">
              {inMonth.map((t) => {
                const d = tripKm(t);
                const mins = minutesBetween(t.started_at, t.ended_at);
                return (
                  <Link to={`/trips/${t.id}`} className="tx-row" key={t.id}>
                    <span className="tx-main">
                      <span className="tx-title">
                        {timeLabel(t.started_at)}
                        {t.purpose === 'work' ? <span className="badge">Work{t.client ? ` · ${t.client}` : ''}</span> : null}
                      </span>
                      <span className="tx-sub">
                        {[t.ended_at ? (mins !== null ? `${mins} min` : null) : 'in progress', t.source === 'shortcut' ? 'CarPlay' : t.distance_source === 'gps' ? 'GPS' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="tx-amount num">{d !== null ? `${d.toFixed(1)} km` : <span className="tx-removed">add km</span>}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {inMonth.length > 0 ? (
          <button className="button button-secondary button-block" onClick={() => void exportMonth()}>
            Export {monthLabel(month)} claim report (CSV)
          </button>
        ) : null}
      </main>
    </Screen>
  );
}
