import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { listCosts, listExpenseDues, listParking, listReadings, listReminders, listTrips } from '../api';
import { ago } from '../lib/geo';
import { useQuery } from '../lib/useQuery';
import { usePhotoUrl, useVehicle } from '../lib/vehicle';
import { addMonths, longDate, monthLabel, monthStart, rm, rmShort, todayKL } from '../lib/format';
import { change, fuelIntervals, latestReading, monthPeriod, per100, periodStats, yearPeriod } from '../lib/stats';
import type { FuelInterval, PeriodStats } from '../lib/stats';
import { daysText, km, kmText, reminderStatus } from '../lib/reminders';
import type { Cost, ExpenseDue, Reading, Reminder, Vehicle } from '../types';

export function Garage() {
  const { vehicle, vehicles, loading, error, select, reload } = useVehicle();

  if (error) {
    return (
      <Screen title="Garage">
        <main className="page stack">
          <ErrorNotice message={error} onRetry={reload} />
        </main>
      </Screen>
    );
  }
  if (loading) {
    return (
      <Screen title="Garage">
        <main className="page stack">
          <Loading />
        </main>
      </Screen>
    );
  }
  if (!vehicle) {
    return (
      <Screen title="Garage">
        <main className="page stack">
          <Empty
            icon="car"
            title="No car yet"
            text="Add your car to start tracking its fuel, services and running costs."
            action={
              <Link to="/settings/car/new" className="button button-primary">
                Add a car
              </Link>
            }
          />
        </main>
      </Screen>
    );
  }

  const switcher =
    vehicles.length > 1 ? (
      <div className="pill-row pill-row-flush" role="group" aria-label="Car">
        {vehicles.map((v) => (
          <button key={v.id} className={`pill ${v.id === vehicle.id ? 'pill-on' : ''}`} onClick={() => select(v.id)}>
            {v.plate || v.model}
          </button>
        ))}
      </div>
    ) : undefined;

  return (
    <Screen
      title="Garage"
      sub={switcher}
      right={
        <Link to="/log" className="nav-pill">
          <Icon name="plus" size={16} strokeWidth={2.6} />
          Log
        </Link>
      }
    >
      <VehicleHome key={vehicle.id} vehicle={vehicle} />
    </Screen>
  );
}

function VehicleHome({ vehicle }: { vehicle: Vehicle }) {
  const costs = useQuery(() => listCosts(vehicle.id), [vehicle.id]);
  const readings = useQuery(() => listReadings(vehicle.id), [vehicle.id]);
  const reminders = useQuery(() => listReminders(vehicle.id), [vehicle.id]);
  const dues = useQuery(listExpenseDues, []);

  const error = costs.error ?? readings.error ?? reminders.error;
  const ready = costs.data && readings.data && reminders.data;

  const derived = useMemo(() => {
    if (!costs.data || !readings.data) return null;
    const intervals = fuelIntervals(costs.data);
    const latest = latestReading(readings.data);
    return { intervals, latest, kmPerDay: kmPerDay(readings.data) };
  }, [costs.data, readings.data]);

  return (
    <main className="page stack">
      {error ? (
        <ErrorNotice
          message={error}
          onRetry={() => {
            costs.reload();
            readings.reload();
            reminders.reload();
          }}
        />
      ) : null}
      {!ready && !error ? <Loading /> : null}
      {ready && derived ? (
        <>
          <CarCard
            vehicle={vehicle}
            intervals={derived.intervals}
            latest={derived.latest}
            primary={reminders.data!.find((r) => r.is_primary && r.active) ?? null}
            kmPerDay={derived.kmPerDay}
            costs={costs.data!}
          />
          <NeedsDetails costs={costs.data!} />
          <QuickLinks vehicleId={vehicle.id} />
          <Stats costs={costs.data!} readings={readings.data!} intervals={derived.intervals} />
          <ComingUp
            reminders={reminders.data!.filter((r) => r.active && !r.is_primary)}
            dues={dues.data ?? []}
            currentKm={derived.latest?.km ?? null}
            kmPerDay={derived.kmPerDay}
          />
        </>
      ) : null}
    </main>
  );
}

/** Average km a day over the last 90 days of readings (or all of them if fewer). */
function kmPerDay(readings: Reading[]): number | null {
  if (readings.length < 2) return null;
  const sorted = [...readings].sort((a, b) => a.read_on.localeCompare(b.read_on));
  const last = sorted[sorted.length - 1];
  const cutoff = addDaysIso(last.read_on, -90);
  const first = sorted.find((r) => r.read_on >= cutoff && r.read_on < last.read_on) ?? sorted[0];
  const days = (Date.parse(last.read_on) - Date.parse(first.read_on)) / 86400000;
  return days > 0 && last.km > first.km ? (last.km - first.km) / days : null;
}

function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ car card
function CarCard({
  vehicle,
  intervals,
  latest,
  primary,
  kmPerDay,
  costs,
}: {
  vehicle: Vehicle;
  intervals: FuelInterval[];
  latest: { km: number; on: string; estimated: boolean } | null;
  primary: Reminder | null;
  kmPerDay: number | null;
  costs: Cost[];
}) {
  const photo = usePhotoUrl(vehicle.photo_path);
  const recent = per100(intervals.slice(-5));
  const lifetime = per100(intervals);
  const sub = [vehicle.variant, vehicle.year].filter(Boolean).join(' · ');

  return (
    <section className="car-card" aria-label={`${vehicle.make} ${vehicle.model}`}>
      <div className="car-head">
        <div className="car-names">
          {vehicle.plate ? <span className="car-plate">{vehicle.plate}</span> : null}
          <h2 className="car-model">
            {vehicle.make} {vehicle.model}
          </h2>
          {sub ? <span className="car-sub">{sub}</span> : null}
        </div>
        <Gauge value={recent} />
      </div>

      {photo ? (
        <img className="car-photo" src={photo} alt="" />
      ) : (
        <Link to={`/settings/car/${vehicle.id}`} className="car-photo-empty">
          <Icon name="image" size={22} />
          <span>Add a car photo</span>
          <small>Transparent PNG looks best</small>
        </Link>
      )}

      <div className="car-pills">
        <Link to="/odometer" className="car-pill">
          <span>ODO</span>
          <strong className="num">{latest ? `${latest.estimated ? '≈ ' : ''}${km(latest.km)} km` : 'Add'}</strong>
        </Link>
        <div className="car-pill">
          <span>AVG</span>
          <strong className="num">{lifetime !== null ? `${lifetime.toFixed(1)} L/100` : '—'}</strong>
        </div>
      </div>
      {latest ? (
        <div className="car-updated">
          {latest.estimated ? `Estimated from a GPS trip, ${longDate(latest.on)} · tap ODO to correct` : `Odometer as of ${longDate(latest.on)}`}
        </div>
      ) : null}

      <NextService primary={primary} currentKm={latest?.km ?? null} kmPerDay={kmPerDay} costs={costs} />
    </section>
  );
}

function Gauge({ value }: { value: number | null }) {
  // 270° arc. Full at 5 L/100, empty at 15 L/100: a fuller ring means thriftier driving.
  const r = 44;
  const arc = 2 * Math.PI * r * 0.75;
  const ratio = value === null ? 0 : Math.min(Math.max((15 - value) / 10, 0.05), 1);
  return (
    <div className="gauge" role="img" aria-label={value === null ? 'Fuel use not measured yet' : `Recent fuel use ${value.toFixed(1)} litres per 100 km`}>
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <circle className="gauge-track" cx="52" cy="52" r={r} strokeDasharray={`${arc} 999`} transform="rotate(135 52 52)" />
        <circle className="gauge-fill" cx="52" cy="52" r={r} strokeDasharray={`${arc * ratio} 999`} transform="rotate(135 52 52)" />
      </svg>
      <div className="gauge-text">
        <strong className="num">{value === null ? '—' : value.toFixed(1)}</strong>
        <span>L/100 KM</span>
      </div>
      <div className="gauge-caption">{value === null ? 'needs 2 full fills' : 'last 5 fills'}</div>
    </div>
  );
}

function NextService({
  primary,
  currentKm,
  kmPerDay,
  costs,
}: {
  primary: Reminder | null;
  currentKm: number | null;
  kmPerDay: number | null;
  costs: Cost[];
}) {
  if (!primary) {
    return (
      <Link to="/reminders/new" className="car-next car-next-empty">
        Set up your next-service reminder <Icon name="chevron-right" size={16} />
      </Link>
    );
  }
  const s = reminderStatus(primary, currentKm, kmPerDay);
  const unset = !primary.every_km && !primary.every_months && !primary.due_on;
  const last = primary.last_done_on
    ? costs.find((c) => c.kind === 'service' && c.occurred_on === primary.last_done_on && c.amount !== null)
    : undefined;

  return (
    <div className="car-next">
      <div className="car-next-title">
        <span>Next · {primary.name}</span>
        {s.state === 'overdue' ? <span className="badge badge-danger">Overdue</span> : null}
        {s.state === 'soon' ? <span className="badge badge-warn">Due soon</span> : null}
      </div>
      {unset ? (
        <Link to={`/reminders/${primary.id}`} className="car-next-set">
          Set how often (months or km) to see what's left <Icon name="chevron-right" size={16} />
        </Link>
      ) : (
        <>
          {s.kmLeft !== null ? (
            <Meter label={`At ${km(s.dueKm!)} km`} value={kmText(s.kmLeft)} used={s.kmUsed} state={s.state} />
          ) : primary.every_km ? (
            <div className="car-next-hint">Log an odometer reading to track the km side.</div>
          ) : null}
          {s.dueOn ? (
            <Meter
              label={`${s.kmLeft !== null ? 'Or by' : 'By'} ${longDate(s.dueOn)}`}
              value={daysText(s.daysLeft)}
              used={s.dateUsed}
              state={s.state}
            />
          ) : null}
        </>
      )}
      <div className="car-next-foot">
        <span>
          {primary.last_done_on ? `Last done ${longDate(primary.last_done_on)}` : 'Not done yet'}
          {last ? ` · ${rm(last.amount)}` : ''}
        </span>
        <span className="car-next-links">
          <Link to={`/reminders/${primary.id}`}>Edit</Link>
          <Link to={`/book?reminder=${primary.id}`}>Book</Link>
        </span>
      </div>
    </div>
  );
}

function Meter({ label, value, used, state }: { label: string; value: string; used: number | null; state: string }) {
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="bar" aria-hidden="true">
        <span className={state === 'overdue' ? 'is-over' : state === 'soon' ? 'is-warn' : ''} style={{ width: `${(used ?? 0) * 100}%` }} />
      </div>
    </div>
  );
}

function NeedsDetails({ costs }: { costs: Cost[] }) {
  const n = costs.filter((c) => c.needs_details).length;
  if (n === 0) return null;
  return (
    <Link to="/history?filter=needs" className="needs-banner">
      <Icon name="flag" size={18} />
      <span>
        <strong>
          {n} expense{n === 1 ? '' : 's'} need{n === 1 ? 's' : ''} car details
        </strong>
        <small>Add litres and odometer so fuel use stays accurate</small>
      </span>
      <Icon name="chevron-right" size={18} />
    </Link>
  );
}

// --------------------------------------------------------------------- stats
type Mode = 'month' | 'year';

function Stats({ costs, readings, intervals }: { costs: Cost[]; readings: Reading[]; intervals: FuelInterval[] }) {
  const thisMonth = monthStart(todayKL());
  const thisYear = Number(thisMonth.slice(0, 4));
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(thisMonth);
  const [year, setYear] = useState(thisYear);

  const period = mode === 'month' ? monthPeriod(month) : yearPeriod(year);
  const prevPeriod = mode === 'month' ? monthPeriod(addMonths(month, -1)) : yearPeriod(year - 1);
  const s = periodStats(costs, readings, intervals, period);
  const p = periodStats(costs, readings, intervals, prevPeriod);
  const prevName = mode === 'month' ? monthLabel(addMonths(month, -1)).split(' ')[0] : String(year - 1);

  const label = mode === 'month' ? monthLabel(month) : String(year);
  const atEnd = mode === 'month' ? month >= thisMonth : year >= thisYear;
  const step = (d: number) => (mode === 'month' ? setMonth(addMonths(month, d)) : setYear(year + d));

  return (
    <section className="stack-tight" aria-label="Stats">
      <h2 className="section-title">Stats</h2>
      <div className="stats-switch">
        <button className="round-button" aria-label="Previous" onClick={() => step(-1)}>
          <Icon name="chevron-left" size={20} />
        </button>
        <strong>{label}</strong>
        <button className="round-button" aria-label="Next" disabled={atEnd} onClick={() => step(1)}>
          <Icon name="chevron-right" size={20} />
        </button>
      </div>
      <div className="segmented segmented-2" role="group" aria-label="Period">
        <button aria-pressed={mode === 'month'} onClick={() => setMode('month')}>
          Month
        </button>
        <button aria-pressed={mode === 'year'} onClick={() => setMode('year')}>
          Year
        </button>
      </div>

      <div className="kpi-grid">
        <Stat label="Distance" value={s.distance !== null ? `${km(s.distance)} km` : '—'} delta={change(s.distance, p.distance)} neutral note={s.distance === null ? 'needs odometer readings' : undefined} />
        <Stat label="Avg fuel" value={s.per100 !== null ? `${s.per100.toFixed(1)} L/100` : '—'} delta={change(s.per100, p.per100)} lowerIsBetter note={s.per100 === null ? 'needs full-tank fills' : undefined} />
        <Stat label="Fuel cost" value={rm(s.fuelCost)} delta={change(s.fuelCost, p.fuelCost)} lowerIsBetter />
        <Stat label="Litres" value={s.litres > 0 ? `${s.litres.toFixed(1)} L` : '—'} note={`${s.fills} fill-up${s.fills === 1 ? '' : 's'}`} />
        <Stat label="Fuel per km" value={s.fuelPerKm !== null ? `RM${s.fuelPerKm.toFixed(2)}` : '—'} note="fuel only" />
        <Stat label="Service & other" value={rm(s.otherCost)} note="excl. fuel" />
      </div>

      <div className="total-card">
        <div>
          <div className="total-label">Total spend</div>
          <div className="total-amount num">{rm(s.total)}</div>
          <div className="total-sub">
            {prevName}: {rm(p.total)}
            {s.distance ? ` · RM${(s.total / s.distance).toFixed(2)}/km all-in` : ''}
          </div>
        </div>
        <Delta value={change(s.total, p.total)} lowerIsBetter inverse />
      </div>

      <Breakdown s={s} />
      <Trend costs={costs} intervals={intervals} />
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  delta,
  lowerIsBetter,
  neutral,
}: {
  label: string;
  value: string;
  note?: string;
  delta?: number | null;
  lowerIsBetter?: boolean;
  neutral?: boolean;
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{value}</div>
      {delta !== undefined && delta !== null ? (
        <Delta value={delta} lowerIsBetter={lowerIsBetter} neutral={neutral} />
      ) : note ? (
        <div className="kpi-note">{note}</div>
      ) : (
        <div className="kpi-note">&nbsp;</div>
      )}
    </div>
  );
}

function Delta({ value, lowerIsBetter, neutral, inverse }: { value: number | null; lowerIsBetter?: boolean; neutral?: boolean; inverse?: boolean }) {
  if (value === null || !Number.isFinite(value)) return inverse ? null : <div className="kpi-note">&nbsp;</div>;
  const up = value > 0;
  const good = neutral ? null : lowerIsBetter ? !up : up;
  const cls = good === null ? '' : good ? 'is-good' : 'is-bad';
  return (
    <div className={`delta ${cls} ${inverse ? 'delta-chip' : ''}`}>
      {up ? '▲' : '▼'} {Math.abs(value * 100).toFixed(0)}%
    </div>
  );
}

function Breakdown({ s }: { s: PeriodStats }) {
  const rows = [
    { label: 'Service & parts', value: s.byKind.service },
    { label: 'Road tax & insurance', value: s.byKind.renewal },
    { label: 'Car care', value: s.byKind.care },
    { label: 'Other', value: s.byKind.other },
  ];
  if (s.otherCost === 0) return null;
  return (
    <div className="group">
      <div className="group-header">Service & other, split</div>
      <div className="group-body">
        {rows
          .filter((r) => r.value > 0)
          .map((r) => (
            <div className="row" key={r.label}>
              <span className="row-label">{r.label}</span>
              <span className="row-value num">{rm(r.value)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function Trend({ costs, intervals }: { costs: Cost[]; intervals: FuelInterval[] }) {
  const [view, setView] = useState<'spend' | 'fuel'>('spend');
  const current = monthStart(todayKL());
  const months = Array.from({ length: 6 }, (_, i) => addMonths(current, i - 5));
  const values = months.map((m) => {
    const p = monthPeriod(m);
    if (view === 'fuel') return per100(intervals.filter((i) => i.end_on >= p.from && i.end_on < p.to));
    return costs.filter((c) => c.occurred_on >= p.from && c.occurred_on < p.to).reduce((t, c) => t + (c.amount ?? 0), 0);
  });
  const max = Math.max(...values.map((v) => v ?? 0), 1);

  return (
    <div className="trend">
      <div className="trend-head">
        <span className="kpi-label">Last 6 months</span>
        <div className="segmented segmented-2 segmented-small" role="group" aria-label="Chart">
          <button aria-pressed={view === 'spend'} onClick={() => setView('spend')}>
            Spend
          </button>
          <button aria-pressed={view === 'fuel'} onClick={() => setView('fuel')}>
            L/100 km
          </button>
        </div>
      </div>
      <div className="trend-bars" role="img" aria-label={`${view === 'spend' ? 'Spend' : 'Fuel use'} for the last 6 months`}>
        {months.map((m, i) => {
          const v = values[i];
          return (
            <div className="trend-col" key={m}>
              <span className="trend-value num">{v === null ? '' : view === 'spend' ? rmShort(v) : v.toFixed(1)}</span>
              <span className={`trend-bar ${m === current ? 'is-now' : ''}`} style={{ height: `${v ? Math.max((v / max) * 100, 4) : 2}%` }} />
              <span className="trend-month">{monthLabel(m).split(' ')[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ coming up
function ComingUp({
  reminders,
  dues,
  currentKm,
  kmPerDay,
}: {
  reminders: Reminder[];
  dues: ExpenseDue[];
  currentKm: number | null;
  kmPerDay: number | null;
}) {
  const rows = [
    ...reminders.map((r) => {
      const s = reminderStatus(r, currentKm, kmPerDay);
      return {
        key: r.id,
        to: `/reminders/${r.id}`,
        name: r.name,
        sub: s.dueOn ? longDate(s.dueOn) : s.dueKm !== null ? `At ${km(s.dueKm)} km` : 'Set how often',
        days: s.soonestDays,
        state: s.state,
        external: false,
      };
    }),
    ...dues.map((d) => ({
      key: d.id,
      to: '',
      name: d.name,
      sub: `${d.next_due ? longDate(d.next_due) : ''}${d.amount !== null ? ` · ${rm(d.amount)}` : ''} · from Expenses`,
      days: d.days_until,
      state: d.days_until !== null && d.days_until <= 7 ? 'soon' : 'ok',
      external: true,
    })),
  ].sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999));

  if (rows.length === 0) return null;
  return (
    <section className="group">
      <div className="section-head">
        <h2 className="section-title">Coming up</h2>
        <Link to="/reminders" className="section-link">
          See all
        </Link>
      </div>
      <div className="group-body">
        {rows.map((r) => {
          const inner = (
            <>
              <span className="tx-main">
                <span className="tx-title">{r.name}</span>
                <span className="tx-sub">{r.sub}</span>
              </span>
              <span className={`due-days ${r.state === 'overdue' ? 'is-over' : r.state === 'soon' ? 'is-warn' : ''}`}>
                {r.days === null ? '' : r.days < 0 ? 'Overdue' : r.days === 0 ? 'Today' : `${r.days} days`}
              </span>
            </>
          );
          return r.external ? (
            <div className="tx-row" key={r.key}>
              {inner}
            </div>
          ) : (
            <Link className="tx-row" to={r.to} key={r.key}>
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- quick links
function QuickLinks({ vehicleId }: { vehicleId: string }) {
  const parking = useQuery(() => listParking(vehicleId, 1), [vehicleId]);
  const trips = useQuery(() => listTrips(vehicleId), [vehicleId]);
  const spot = parking.data?.[0];
  const recentSpot = spot && Date.now() - Date.parse(spot.parked_at) < 3 * 86400000 ? spot : null;
  const month = monthStart(todayKL());
  const open = (trips.data ?? []).find((t) => !t.ended_at && Date.now() - Date.parse(t.started_at) < 86400000);
  const monthTrips = (trips.data ?? []).filter((t) => t.started_at.slice(0, 7) >= month.slice(0, 7)).length;

  return (
    <nav className="quick-links" aria-label="More">
      <Link to="/fuel" className="quick-link">
        <Icon name="fuel" size={20} />
        <strong>Fuel</strong>
        <small>Trends & stations</small>
      </Link>
      <Link to="/parking" className={`quick-link ${recentSpot ? 'is-active' : ''}`}>
        <Icon name="car" size={20} />
        <strong>Parking</strong>
        <small>{recentSpot ? `${recentSpot.bay ? `${recentSpot.bay} · ` : ''}${ago(recentSpot.parked_at)}` : 'Save your spot'}</small>
      </Link>
      <Link to="/trips" className={`quick-link ${open ? 'is-active' : ''}`}>
        <Icon name="gauge" size={20} />
        <strong>Trips</strong>
        <small>{open ? 'In progress' : monthTrips ? `${monthTrips} this month` : 'Log & claim'}</small>
      </Link>
      <Link to="/parts" className="quick-link">
        <Icon name="tag" size={20} />
        <strong>Prices</strong>
        <small>Parts over time</small>
      </Link>
    </nav>
  );
}
