import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { listCosts, listPartLines, listReadings } from '../api';
import { useQuery } from '../lib/useQuery';
import { usePhotoUrl, useVehicle } from '../lib/vehicle';
import { longDate, rm, todayKL } from '../lib/format';
import { KIND_LABEL } from '../lib/kinds';
import { km } from '../lib/reminders';
import type { Cost, PartLine, Reading } from '../types';

/**
 * A clean, printable service history for selling the car or a warranty claim.
 * "Save as PDF" uses the phone's print sheet (Share › Print › pinch out › Share › Save to Files).
 */
export function Report() {
  const navigate = useNavigate();
  const { vehicle } = useVehicle();
  const vid = vehicle?.id ?? '';
  const costs = useQuery(() => (vid ? listCosts(vid) : Promise.resolve([] as Cost[])), [vid]);
  const readings = useQuery(() => (vid ? listReadings(vid) : Promise.resolve([] as Reading[])), [vid]);
  const parts = useQuery(() => (vid ? listPartLines(vid) : Promise.resolve([] as PartLine[])), [vid]);
  const photo = usePhotoUrl(vehicle?.photo_path);

  const r = useMemo(() => {
    const all = (costs.data ?? []).filter((c) => c.amount !== null || c.removed_amount !== null);
    const records = all.filter((c) => c.kind !== 'fuel').sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    const fuel = all.filter((c) => c.kind === 'fuel');
    const total = all.reduce((t, c) => t + (c.amount ?? 0), 0);
    const byKind = { fuel: 0, service: 0, renewal: 0, care: 0, other: 0 } as Record<Cost['kind'], number>;
    for (const c of all) byKind[c.kind] += c.amount ?? 0;

    // One odometer point per month (the highest), for the progression table and chart.
    const perMonth = new Map<string, Reading>();
    for (const x of readings.data ?? []) {
      const k = x.read_on.slice(0, 7);
      const prev = perMonth.get(k);
      if (!prev || x.km > prev.km) perMonth.set(k, x);
    }
    const odo = [...perMonth.values()].sort((a, b) => a.read_on.localeCompare(b.read_on));

    const years = new Map<string, { fills: number; litres: number; spend: number }>();
    for (const f of fuel) {
      const y = f.occurred_on.slice(0, 4);
      const s = years.get(y) ?? { fills: 0, litres: 0, spend: 0 };
      s.fills += 1;
      s.litres += f.litres ?? 0;
      s.spend += f.amount ?? 0;
      years.set(y, s);
    }

    const itemsByEntry = new Map<string, PartLine[]>();
    for (const p of parts.data ?? []) itemsByEntry.set(p.entry_id, [...(itemsByEntry.get(p.entry_id) ?? []), p]);

    const first = all.length ? all.reduce((m, c) => (c.occurred_on < m ? c.occurred_on : m), all[0].occurred_on) : null;
    return { records, total, byKind, odo, years: [...years.entries()].sort(), itemsByEntry, first, count: all.length };
  }, [costs.data, readings.data, parts.data]);

  const loading = !costs.data || !readings.data || !parts.data;
  const error = costs.error ?? readings.error ?? parts.error;
  const maxKm = Math.max(...r.odo.map((o) => o.km), 1);
  const minKm = Math.min(...r.odo.map((o) => o.km), maxKm);

  return (
    <div className="report">
      <div className="report-bar no-print">
        <button className="nav-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} />
          Back
        </button>
        <button className="button button-primary button-small" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      {error ? <ErrorNotice message={error} /> : null}
      {loading && !error ? <Loading /> : null}

      {!loading && vehicle ? (
        <article className="report-page">
          <header className="report-head">
            <div>
              <div className="report-kicker">Service history report</div>
              <h1>
                {vehicle.make} {vehicle.model}
              </h1>
              <div className="report-meta">
                {[vehicle.variant, vehicle.year, vehicle.plate].filter(Boolean).join(' · ')}
              </div>
              <div className="report-meta">
                Records from {r.first ? longDate(r.first) : '—'} to {longDate(todayKL())}
              </div>
            </div>
            {photo ? <img className="report-photo" src={photo} alt="" /> : null}
          </header>

          <section className="report-summary">
            <div>
              <span>Odometer</span>
              <strong>{r.odo.length ? `${km(r.odo[r.odo.length - 1].km)} km` : '—'}</strong>
            </div>
            <div>
              <span>Records</span>
              <strong>{r.count}</strong>
            </div>
            <div>
              <span>Total spend</span>
              <strong>{rm(r.total)}</strong>
            </div>
            <div>
              <span>Service & parts</span>
              <strong>{rm(r.byKind.service)}</strong>
            </div>
          </section>

          {r.odo.length > 1 ? (
            <section className="report-section">
              <h2>Odometer progression</h2>
              <div className="report-odo" role="img" aria-label="Odometer readings over time">
                {r.odo.map((o) => (
                  <div className="report-odo-col" key={o.read_on}>
                    <span className="report-odo-bar" style={{ height: `${maxKm > minKm ? 15 + ((o.km - minKm) / (maxKm - minKm)) * 85 : 60}%` }} />
                    <span className="report-odo-label">{o.read_on.slice(2, 7).replace('-', '/')}</span>
                  </div>
                ))}
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num-col">Odometer</th>
                  </tr>
                </thead>
                <tbody>
                  {r.odo.map((o) => (
                    <tr key={o.read_on}>
                      <td>{longDate(o.read_on)}</td>
                      <td className="num-col">{km(o.km)} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="report-section">
            <h2>Service, parts and renewals</h2>
            {r.records.length === 0 ? (
              <p className="report-empty">No records yet.</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Work done</th>
                    <th className="num-col">Odometer</th>
                    <th className="num-col">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {r.records.map((c) => {
                    const items = c.entry_id ? r.itemsByEntry.get(c.entry_id) ?? [] : [];
                    return (
                      <tr key={c.entry_id ?? c.transaction_id}>
                        <td>{longDate(c.occurred_on)}</td>
                        <td>
                          <strong>{c.title}</strong>
                          <div className="report-sub">
                            {[KIND_LABEL[c.kind], c.place].filter(Boolean).join(' · ')}
                          </div>
                          {items.length > 0 ? (
                            <ul className="report-items">
                              {items.map((i, n) => (
                                <li key={n}>
                                  {i.name}
                                  {i.amount !== null ? ` — ${rm(i.amount)}` : ''}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className="num-col">{c.odometer_km !== null ? `${km(c.odometer_km)} km` : '—'}</td>
                        <td className="num-col">{rm(c.amount ?? c.removed_amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {r.years.length > 0 ? (
            <section className="report-section">
              <h2>Fuel by year</h2>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th className="num-col">Fill-ups</th>
                    <th className="num-col">Litres</th>
                    <th className="num-col">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {r.years.map(([y, s]) => (
                    <tr key={y}>
                      <td>{y}</td>
                      <td className="num-col">{s.fills}</td>
                      <td className="num-col">{s.litres > 0 ? s.litres.toFixed(1) : '—'}</td>
                      <td className="num-col">{rm(s.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <footer className="report-foot">
            Prepared with Garage on {longDate(todayKL())}. Records are as logged by the owner; receipts are kept for each record where scanned.
          </footer>
        </article>
      ) : null}
    </div>
  );
}
