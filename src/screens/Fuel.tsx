import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { listCosts } from '../api';
import { useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { addMonths, monthLabel, monthStart, rm, rmShort, shortDate, todayKL } from '../lib/format';
import { fuelIntervals, monthPeriod, per100 } from '../lib/stats';
import type { FuelInterval } from '../lib/stats';
import { km } from '../lib/reminders';
import type { Cost } from '../types';

type ChartView = 'spend' | 'use' | 'price';

/** First word of a station name, so "Petronas Rawang" and "PETRONAS KM 22" group together. */
function brand(place: string | null): string {
  if (!place) return 'Unknown';
  const w = place.trim().split(/\s+/)[0];
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function daysAgoIso(n: number): string {
  const d = new Date(`${todayKL()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function Fuel() {
  const navigate = useNavigate();
  const { vehicle } = useVehicle();
  const costs = useQuery(() => (vehicle ? listCosts(vehicle.id) : Promise.resolve([] as Cost[])), [vehicle?.id]);
  const [view, setView] = useState<ChartView>('spend');

  const d = useMemo(() => {
    const all = costs.data ?? [];
    const fills = all.filter((c) => c.kind === 'fuel');
    const intervals = fuelIntervals(all);
    const since90 = daysAgoIso(90);
    const recent = intervals.filter((i) => i.end_on >= since90);
    const usual = per100(intervals);
    const recentFills = fills.filter((f) => f.occurred_on >= since90 && f.litres && f.amount !== null);
    const recentLitres = recentFills.reduce((t, f) => t + (f.litres ?? 0), 0);
    const recentSpend = recentFills.reduce((t, f) => t + (f.amount ?? 0), 0);
    const intervalKm = intervals.reduce((t, i) => t + i.km, 0);
    const intervalLitres = intervals.reduce((t, i) => t + i.litres, 0);
    const avgPrice = recentLitres > 0 ? recentSpend / recentLitres : null;
    const thisMonth = monthPeriod(monthStart(todayKL()));
    const monthFills = fills.filter((f) => f.occurred_on >= thisMonth.from && f.occurred_on < thisMonth.to);

    const byEntry = new Map<string, FuelInterval>();
    for (const i of intervals) if (i.end_entry) byEntry.set(i.end_entry, i);

    // Station league: fill-ups, price paid, and how far each station's tank went.
    const stations = new Map<string, { fills: number; litres: number; spend: number; ivs: FuelInterval[] }>();
    for (const f of fills) {
      if (!f.place) continue;
      const s = stations.get(brand(f.place)) ?? { fills: 0, litres: 0, spend: 0, ivs: [] };
      s.fills += 1;
      if (f.litres && f.amount !== null) {
        s.litres += f.litres;
        s.spend += f.amount;
      }
      stations.set(brand(f.place), s);
    }
    for (const i of intervals) {
      if (!i.start_place) continue;
      const s = stations.get(brand(i.start_place));
      if (s) s.ivs.push(i);
    }
    const stationRows = [...stations.entries()]
      .map(([name, s]) => ({ name, fills: s.fills, price: s.litres > 0 ? s.spend / s.litres : null, use: per100(s.ivs) }))
      .sort((a, b) => b.fills - a.fills);

    return {
      fills,
      intervals,
      usual,
      recentUse: per100(recent),
      perKm: intervalKm > 0 && avgPrice !== null ? (intervalLitres / intervalKm) * avgPrice : null,
      avgPrice,
      monthSpend: monthFills.reduce((t, f) => t + (f.amount ?? 0), 0),
      monthFills: monthFills.length,
      byEntry,
      stationRows,
      needs: fills.filter((f) => f.needs_details).length,
      withDetails: fills.filter((f) => f.litres !== null).length,
    };
  }, [costs.data]);

  const current = monthStart(todayKL());
  const months = Array.from({ length: 12 }, (_, i) => addMonths(current, i - 11));
  const values = months.map((m) => {
    const p = monthPeriod(m);
    const inM = d.fills.filter((f) => f.occurred_on >= p.from && f.occurred_on < p.to);
    if (view === 'spend') return inM.reduce((t, f) => t + (f.amount ?? 0), 0);
    if (view === 'use') return per100(d.intervals.filter((i) => i.end_on >= p.from && i.end_on < p.to));
    const priced = inM.filter((f) => f.litres && f.amount !== null);
    const l = priced.reduce((t, f) => t + (f.litres ?? 0), 0);
    return l > 0 ? priced.reduce((t, f) => t + (f.amount ?? 0), 0) / l : null;
  });
  const max = Math.max(...values.map((v) => v ?? 0), 0.0001);
  const fmt = (v: number) => (view === 'spend' ? rmShort(v) : view === 'use' ? v.toFixed(1) : v.toFixed(2));

  return (
    <Screen
      title="Fuel"
      compact
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} />
          Back
        </button>
      }
      right={
        <Link to="/log?kind=fuel" className="nav-button" aria-label="Log fill-up">
          <Icon name="plus" size={22} />
        </Link>
      }
    >
      <main className="page stack">
        {costs.error ? <ErrorNotice message={costs.error} onRetry={costs.reload} /> : null}
        {!costs.data && !costs.error ? <Loading /> : null}
        {costs.data && d.fills.length === 0 ? (
          <Empty icon="fuel" title="No fill-ups yet" text="Log a fill-up, or pay for petrol with Apple Pay and pick Petrol, and it shows up here." />
        ) : null}

        {costs.data && d.fills.length > 0 ? (
          <>
            {d.needs > 0 ? (
              <Link to="/history?filter=needs" className="needs-banner">
                <Icon name="flag" size={18} />
                <span>
                  <strong>
                    {d.needs} fill-up{d.needs === 1 ? '' : 's'} need{d.needs === 1 ? 's' : ''} litres and odometer
                  </strong>
                  <small>Tap one, then Scan receipt to fill it in</small>
                </span>
                <Icon name="chevron-right" size={18} />
              </Link>
            ) : null}

            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">Last 90 days</div>
                <div className="kpi-value num">{d.recentUse !== null ? `${d.recentUse.toFixed(1)} L/100` : '—'}</div>
                <div className="kpi-note">{d.usual !== null ? `usual ${d.usual.toFixed(1)}` : 'needs 2 full fills'}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Fuel per km</div>
                <div className="kpi-value num">{d.perKm !== null ? `RM${d.perKm.toFixed(2)}` : '—'}</div>
                <div className="kpi-note">at recent prices</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Avg price</div>
                <div className="kpi-value num">{d.avgPrice !== null ? `RM${d.avgPrice.toFixed(2)}/L` : '—'}</div>
                <div className="kpi-note">last 90 days</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">This month</div>
                <div className="kpi-value num">{rm(d.monthSpend)}</div>
                <div className="kpi-note">
                  {d.monthFills} fill-up{d.monthFills === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            <div className="trend">
              <div className="trend-head">
                <span className="kpi-label">Last 12 months</span>
              </div>
              <div className="segmented" role="group" aria-label="Chart">
                <button aria-pressed={view === 'spend'} onClick={() => setView('spend')}>
                  Spend
                </button>
                <button aria-pressed={view === 'use'} onClick={() => setView('use')}>
                  L/100 km
                </button>
                <button aria-pressed={view === 'price'} onClick={() => setView('price')}>
                  RM/litre
                </button>
              </div>
              <div className="trend-bars trend-bars-12" role="img" aria-label={`Fuel ${view} for the last 12 months`}>
                {months.map((m, i) => {
                  const v = values[i];
                  return (
                    <div className="trend-col" key={m}>
                      <span className="trend-value num">{v ? fmt(v) : ''}</span>
                      <span className={`trend-bar ${m === current ? 'is-now' : ''}`} style={{ height: `${v ? Math.max((v / max) * 100, 4) : 2}%` }} />
                      <span className="trend-month">{monthLabel(m).slice(0, 1)}</span>
                    </div>
                  );
                })}
              </div>
              {view !== 'spend' && d.withDetails === 0 ? (
                <div className="kpi-note">Fill-ups need litres (and odometer for L/100 km) to show here.</div>
              ) : null}
            </div>

            {d.stationRows.length > 0 ? (
              <section className="group">
                <div className="group-header">By station</div>
                <div className="group-body">
                  {d.stationRows.map((s) => (
                    <div className="row" key={s.name}>
                      <span className="row-label">
                        {s.name}
                        <span className="row-sub">
                          {s.fills} fill-up{s.fills === 1 ? '' : 's'}
                          {s.price !== null ? ` · RM${s.price.toFixed(2)}/L` : ''}
                        </span>
                      </span>
                      <span className="row-value num">{s.use !== null ? `${s.use.toFixed(1)} L/100` : '—'}</span>
                    </div>
                  ))}
                </div>
                <div className="group-footer">L/100 km is credited to the station that filled the tank you drove on.</div>
              </section>
            ) : null}

            <section className="group">
              <div className="group-header">Fill-ups</div>
              <div className="group-body">
                {d.fills.slice(0, 60).map((f) => {
                  const iv = f.entry_id ? d.byEntry.get(f.entry_id) : undefined;
                  const use = iv ? (iv.litres / iv.km) * 100 : null;
                  const diff = use !== null && d.usual ? (use - d.usual) / d.usual : null;
                  const to = f.entry_id ? `/entry/${f.entry_id}` : `/link/${f.transaction_id}`;
                  return (
                    <Link to={to} className="tx-row" key={f.entry_id ?? f.transaction_id}>
                      <span className="tx-main">
                        <span className="tx-title">
                          {f.place ?? f.title} · {shortDate(f.occurred_on)}
                        </span>
                        <span className="tx-sub">
                          {[
                            f.fuel_grade,
                            f.litres !== null ? `${f.litres.toFixed(1)} L` : null,
                            f.litres && f.amount ? `RM${(f.amount / f.litres).toFixed(2)}/L` : null,
                            f.odometer_km !== null ? `${km(f.odometer_km)} km` : null,
                            f.full_tank === false ? 'part fill' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || (f.needs_details ? '' : 'no details')}
                          {f.needs_details ? <span className="badge badge-warn">Needs details</span> : null}
                        </span>
                        {use !== null ? (
                          <span className={`tx-sub ${diff !== null && Math.abs(diff) >= 0.03 ? (diff < 0 ? 'is-good-text' : 'is-bad-text') : ''}`}>
                            {use.toFixed(1)} L/100 over {km(iv!.km)} km
                            {diff !== null && Math.abs(diff) >= 0.03 ? ` · ${Math.abs(diff * 100).toFixed(0)}% ${diff < 0 ? 'better' : 'worse'} than usual` : ''}
                          </span>
                        ) : null}
                      </span>
                      <span className="tx-amount num">{rm(f.amount)}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </Screen>
  );
}
