import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { getSettings, listSavedPlaces, listTripExtras, listTrips } from '../api';
import { useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { longDate, monthLabel, rm, todayKL } from '../lib/format';
import { monthPeriod } from '../lib/stats';
import { klDate } from '../lib/geo';
import { claimKm, officeOf, tripClaim } from '../lib/places';
import type { Trip } from '../types';

/**
 * One month's mileage, toll and parking claim, laid out to print or save as PDF and submit.
 * "Save as PDF" uses the phone's print sheet, like the service history report.
 */
/** 1234.5 -> "1,234.50" */
function money(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "27 Oct" */
function shortDay(d: string): string {
  return new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' });
}

export function ClaimForm() {
  const { month: ym } = useParams();
  const navigate = useNavigate();
  const { vehicle } = useVehicle();
  const month = `${ym ?? todayKL().slice(0, 7)}-01`;
  const period = monthPeriod(month);
  const trips = useQuery(() => (vehicle ? listTrips(vehicle.id) : Promise.resolve([] as Trip[])), [vehicle?.id]);
  const settings = useQuery(getSettings, []);
  const places = useQuery(listSavedPlaces, []);
  const work = useMemo(
    () =>
      (trips.data ?? [])
        .filter((t) => t.purpose === 'work' && klDate(t.started_at) >= period.from && klDate(t.started_at) < period.to)
        .sort((a, b) => a.started_at.localeCompare(b.started_at)),
    [trips.data, period.from, period.to],
  );
  const extras = useQuery(() => listTripExtras(work.map((t) => t.id)), [work.map((t) => t.id).join(',')]);

  const rate = settings.data?.claim_rate ?? null;
  const office = officeOf(places.data);
  const rows = work.map((t) => ({ t, c: tripClaim(t, extras.data ?? [], rate), x: (extras.data ?? []).filter((e) => e.trip_id === t.id) }));
  const total = (k: 'km' | 'mileage' | 'tolls' | 'parking' | 'total') => rows.reduce((s, r) => s + r.c[k], 0);
  const loading = !trips.data || !settings.data || !places.data || !extras.data;
  const error = trips.error ?? settings.error ?? places.error ?? extras.error;

  function route(t: Trip): string {
    const to = t.dest_label ?? t.client ?? 'Destination';
    if (t.claim_source === 'office' && office) return `${office.label} ${t.claim_return ? '↔' : '→'} ${to}`;
    return to;
  }

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

      {!loading ? (
        <article className="report-page">
          <header className="report-head">
            <div>
              <div className="report-kicker">Mileage, toll &amp; parking claim</div>
              <h1>{monthLabel(month)}</h1>
              <div className="report-meta">Claimant: {settings.data?.claim_name || '______________________'}</div>
              <div className="report-meta">
                {[vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') : null, vehicle?.plate].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="report-meta claim-head-right">
              {rate !== null ? <div>Rate {rm(rate)} / km</div> : <div>Rate not set</div>}
              {office ? <div>Measured from {office.label}</div> : null}
            </div>
          </header>

          <section className="report-summary">
            <div>
              <span>Work trips</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <span>Mileage</span>
              <strong>{rm(total('mileage'))}</strong>
            </div>
            <div>
              <span>Tolls &amp; parking</span>
              <strong>{rm(total('tolls') + total('parking'))}</strong>
            </div>
            <div>
              <span>Total claim</span>
              <strong>{rm(total('total'))}</strong>
            </div>
          </section>

          {rows.length === 0 ? (
            <p className="report-empty">No work trips in {monthLabel(month)}.</p>
          ) : (
            <section className="report-section claim-scroll">
              <table className="report-table claim-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Purpose &amp; route</th>
                    <th className="num-col">Km</th>
                    <th className="num-col">Mileage RM</th>
                    <th className="num-col wide-only">Tolls RM</th>
                    <th className="num-col wide-only">Parking RM</th>
                    <th className="num-col">Total RM</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ t, c, x }) => (
                    <tr key={t.id}>
                      <td className="claim-date">{shortDay(klDate(t.started_at))}</td>
                      <td>
                        {t.client ?? 'Work'}
                        <div className="report-sub">{route(t)}</div>
                        {x.length ? <div className="report-sub">{x.map((e) => `${e.description} ${rm(e.amount)}`).join(' · ')}</div> : null}
                      </td>
                      <td className="num-col">{(claimKm(t) ?? 0).toFixed(1)}</td>
                      <td className="num-col">{money(c.mileage)}</td>
                      <td className="num-col wide-only">{c.tolls ? money(c.tolls) : '—'}</td>
                      <td className="num-col wide-only">{c.parking ? money(c.parking) : '—'}</td>
                      <td className="num-col">
                        <strong>{money(c.total)}</strong>
                      </td>
                    </tr>
                  ))}
                  <tr className="claim-total-row">
                    <td colSpan={2}>
                      <strong>Total</strong>
                    </td>
                    <td className="num-col">
                      <strong>{total('km').toFixed(1)}</strong>
                    </td>
                    <td className="num-col">
                      <strong>{money(total('mileage'))}</strong>
                    </td>
                    <td className="num-col wide-only">
                      <strong>{money(total('tolls'))}</strong>
                    </td>
                    <td className="num-col wide-only">
                      <strong>{money(total('parking'))}</strong>
                    </td>
                    <td className="num-col">
                      <strong>{money(total('total'))}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          <section className="claim-sign">
            <div>
              <span />
              Claimant signature &amp; date
            </div>
            <div>
              <span />
              Approved by
            </div>
          </section>

          <footer className="report-foot">
            Mileage is the road distance between the office and each destination{rate !== null ? `, at ${rm(rate)} per km` : ''}. Tolls and parking match the
            expenses logged for each trip. Generated by Garage on {longDate(todayKL())}.
          </footer>
        </article>
      ) : null}
    </div>
  );
}
