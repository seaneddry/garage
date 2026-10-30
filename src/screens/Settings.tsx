import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth';
import { getSettings, listCosts, listTrips, saveSettings } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { parseAmount, todayKL } from '../lib/format';
import { shareOrDownload, toCsv } from '../lib/csv';
import { KIND_LABEL } from '../lib/kinds';
import { klDate, minutesBetween } from '../lib/geo';
import { tripKm } from '../lib/trips';
import { claimKm, officeOf } from '../lib/places';

const EXPENSES_URL = 'https://seaneddry.github.io/expense-tracker/';

export function Settings() {
  const { session, signOut } = useAuth();
  const { vehicles, vehicle } = useVehicle();
  const settings = useQuery(getSettings, []);
  const toast = useToast();
  const bump = useBump();
  const [from, setFrom] = useState('');
  const [rate, setRate] = useState('');
  const [exporting, setExporting] = useState(false);
  const office = officeOf(settings.data);

  useEffect(() => {
    if (settings.data) {
      setFrom(settings.data.tracking_from);
      setRate(settings.data.claim_rate !== null ? String(settings.data.claim_rate) : '');
    }
  }, [settings.data]);

  async function saveRate() {
    const n = rate.trim() === '' ? null : parseAmount(rate);
    if (rate.trim() !== '' && n === null) return;
    if (n === (settings.data?.claim_rate ?? null)) return;
    try {
      await saveSettings({ claim_rate: n });
      bump();
      toast('Claim rate saved');
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function exportCosts() {
    if (!vehicle) return;
    setExporting(true);
    try {
      const costs = await listCosts(vehicle.id);
      const rows: (string | number | boolean | null)[][] = [
        ['Date', 'Type', 'What', 'Place', 'Amount (RM)', 'Odometer (km)', 'Litres', 'Fuel grade', 'Full tank', 'Notes', 'In Expenses'],
      ];
      for (const c of [...costs].reverse()) {
        rows.push([
          c.occurred_on,
          KIND_LABEL[c.kind],
          c.title,
          c.place,
          c.amount ?? c.removed_amount,
          c.odometer_km,
          c.litres,
          c.fuel_grade,
          c.kind === 'fuel' ? (c.full_tank === false ? 'no' : c.full_tank ? 'yes' : '') : '',
          c.notes,
          c.cost_removed ? 'deleted there' : 'yes',
        ]);
      }
      const slug = (vehicle.plate || vehicle.model).replace(/\s+/g, '-').toLowerCase();
      await shareOrDownload(`garage-${slug}-costs.csv`, toCsv(rows));
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  async function exportTrips() {
    if (!vehicle) return;
    setExporting(true);
    try {
      const trips = await listTrips(vehicle.id);
      const rows: (string | number | null)[][] = [
        ['Date', 'Started', 'Ended', 'Minutes', 'Distance driven (km)', 'Purpose', 'Client / category', 'Destination', 'Claim (km)', 'Start odometer', 'End odometer', 'Notes'],
      ];
      for (const t of [...trips].reverse()) {
        const d = tripKm(t);
        const c = claimKm(t);
        rows.push([klDate(t.started_at), t.started_at, t.ended_at, minutesBetween(t.started_at, t.ended_at), d !== null ? d.toFixed(1) : '', t.purpose, t.client, t.dest_label, c !== null ? c.toFixed(1) : '', t.start_odo, t.end_odo, t.notes]);
      }
      await shareOrDownload('garage-trips.csv', toCsv(rows));
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  async function saveFrom(value: string) {
    setFrom(value);
    if (!value) return;
    try {
      await saveSettings({ tracking_from: value });
      bump();
      toast('Saved');
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Screen title="Settings">
      <main className="page stack">
        <section className="group">
          <div className="group-header">Cars</div>
          <div className="group-body">
            {vehicles.map((v) => (
              <Link to={`/settings/car/${v.id}`} className="row" key={v.id}>
                <span className="row-icon">
                  <Icon name="car" size={20} />
                </span>
                <span className="row-label">
                  {v.make} {v.model}
                  <span className="row-sub">{[v.plate, v.year, v.is_default && vehicles.length > 1 ? 'Main car' : null].filter(Boolean).join(' · ') || 'Add plate and photo'}</span>
                </span>
                <Icon name="chevron-right" size={18} />
              </Link>
            ))}
            <Link to="/settings/car/new" className="row">
              <span className="row-icon">
                <Icon name="plus" size={20} />
              </span>
              <span className="row-label">Add a car</span>
            </Link>
          </div>
        </section>

        <section className="group">
          <div className="group-body">
            <Link to="/workshops" className="row">
              <span className="row-icon">
                <Icon name="wrench" size={20} />
              </span>
              <span className="row-label">
                Workshops
                <span className="row-sub">Call, WhatsApp, Waze, book</span>
              </span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <Link to="/settings/shortcuts" className="row">
              <span className="row-icon">
                <Icon name="link" size={20} />
              </span>
              <span className="row-label">
                Shortcuts & Siri
                <span className="row-sub">CarPlay trips, parking, "what's due"</span>
              </span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <Link to="/settings/notifications" className="row">
              <span className="row-icon">
                <Icon name="bell" size={20} />
              </span>
              <span className="row-label">
                Notifications
                <span className="row-sub">Alerts when a car job is due</span>
              </span>
              <Icon name="chevron-right" size={18} />
            </Link>
          </div>
        </section>

        <section className="group">
          <div className="group-body">
            <Link to="/odometer" className="row">
              <span className="row-icon">
                <Icon name="gauge" size={20} />
              </span>
              <span className="row-label">Update odometer</span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <label className="row-input">
              <span className="row-label">Ask for details from</span>
              <input type="date" value={from} max={todayKL()} onChange={(e) => saveFrom(e.target.value)} />
            </label>
          </div>
          <div className="group-footer">
            Petrol and service expenses from this date that have no litres or odometer are flagged "Needs details". Older ones still count in your spending.
          </div>
        </section>

        <section className="group">
          <div className="group-header">Trips</div>
          <div className="group-body">
            <Link to="/settings/office" className="row">
              <span className="row-icon">
                <Icon name="flag" size={20} />
              </span>
              <span className="row-label">
                Office
                <span className="row-sub">{office ? office.label : 'Not set: work trips claim the km you drove'}</span>
              </span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <label className="row-input">
              <span className="row-label">Claim rate (RM per km)</span>
              <input inputMode="decimal" placeholder="e.g. 0.60" value={rate} onChange={(e) => setRate(e.target.value)} onBlur={() => void saveRate()} />
            </label>
          </div>
          <div className="group-footer">Work trips claim the road distance between your office and where you went, at your employer's rate.</div>
        </section>

        <section className="group">
          <div className="group-header">Reports & exports</div>
          <div className="group-body">
            <Link to="/report" className="row">
              <span className="row-icon">
                <Icon name="doc" size={20} />
              </span>
              <span className="row-label">
                Service history report
                <span className="row-sub">Print or save as PDF, for a buyer or warranty</span>
              </span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <Link to="/parts" className="row">
              <span className="row-icon">
                <Icon name="tag" size={20} />
              </span>
              <span className="row-label">
                Part prices
                <span className="row-sub">What each part and job cost every time</span>
              </span>
              <Icon name="chevron-right" size={18} />
            </Link>
            <button className="row row-button" disabled={exporting} onClick={() => void exportCosts()}>
              <span className="row-icon">
                <Icon name="download" size={20} />
              </span>
              <span className="row-label">Export all costs (CSV)</span>
            </button>
            <button className="row row-button" disabled={exporting} onClick={() => void exportTrips()}>
              <span className="row-icon">
                <Icon name="download" size={20} />
              </span>
              <span className="row-label">Export all trips (CSV)</span>
            </button>
          </div>
        </section>

        <section className="group">
          <div className="group-header">Linked with Expenses</div>
          <div className="group-body">
            <a className="row" href={EXPENSES_URL}>
              <span className="row-icon">
                <Icon name="wallet" size={20} />
              </span>
              <span className="row-label">
                Open Expense Tracker
                <span className="row-sub">Fuel → Petrol · everything else → Vehicle</span>
              </span>
              <Icon name="external" size={18} />
            </a>
          </div>
          <div className="group-footer">
            Every cost you log here is also an expense there, and Petrol or Vehicle expenses logged there show up here. Edits on either side show in both.
          </div>
        </section>

        <section className="group">
          <div className="group-body">
            <div className="row">
              <span className="row-label">
                Signed in
                <span className="row-sub">{session?.user.email}</span>
              </span>
            </div>
            <button className="row row-danger" onClick={() => signOut()}>
              <span className="row-label">Sign out</span>
            </button>
          </div>
        </section>
      </main>
    </Screen>
  );
}
