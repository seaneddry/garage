import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth';
import { getSettings, saveSettings } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { todayKL } from '../lib/format';

const EXPENSES_URL = 'https://seaneddry.github.io/expense-tracker/';

export function Settings() {
  const { session, signOut } = useAuth();
  const { vehicles } = useVehicle();
  const settings = useQuery(getSettings, []);
  const toast = useToast();
  const bump = useBump();
  const [from, setFrom] = useState('');

  useEffect(() => {
    if (settings.data) setFrom(settings.data.tracking_from);
  }, [settings.data]);

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
