import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { addReading, listReadings } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { longDate, todayKL } from '../lib/format';
import { latestReading } from '../lib/stats';
import { km } from '../lib/reminders';

export function Odometer() {
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { vehicle } = useVehicle();
  const readings = useQuery(() => (vehicle ? listReadings(vehicle.id) : Promise.resolve([])), [vehicle?.id]);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayKL());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(value.replace(/[,\s]/g, ''));
  const valid = value.trim() !== '' && Number.isInteger(n) && n >= 0 && Boolean(vehicle);
  const latest = latestReading(readings.data ?? []);
  const recent = [...(readings.data ?? [])].sort((a, b) => b.read_on.localeCompare(a.read_on)).slice(0, 8);

  async function save() {
    if (!valid || !vehicle) return;
    setBusy(true);
    setError(null);
    try {
      await addReading(vehicle.id, date, n);
      bump();
      toast(`Odometer ${km(n)} km`);
      navigate(-1);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Odometer"
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          Cancel
        </button>
      }
      right={
        <button className="nav-button nav-button-strong" disabled={!valid || busy} onClick={save}>
          Save
        </button>
      }
    >
      <main className="page stack">
        <div className="amount-field">
          <input
            inputMode="numeric"
            placeholder={latest ? km(latest.km) : '0'}
            aria-label="Odometer in km"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <span className="currency">km</span>
        </div>
        <div className="group">
          <div className="group-body">
            <label className="row-input">
              <span className="row-label">Date</span>
              <input type="date" value={date} max={todayKL()} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          {latest && valid && n < latest.km ? (
            <div className="group-footer">Lower than the last reading ({km(latest.km)} km on {longDate(latest.on)}).</div>
          ) : (
            <div className="group-footer">Fill-ups and services with an odometer reading update this too.</div>
          )}
        </div>
        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}
        {readings.error ? <ErrorNotice message={readings.error} onRetry={readings.reload} /> : null}
        {!readings.data && !readings.error ? <Loading /> : null}
        {recent.length > 0 ? (
          <div className="group">
            <div className="group-header">Recent readings</div>
            <div className="group-body">
              {recent.map((r, i) => (
                <div className="row" key={`${r.read_on}-${r.km}-${i}`}>
                  <span className="row-label">{longDate(r.read_on)}</span>
                  <span className="row-value num">
                    {km(r.km)} km{r.source === 'entry' ? ' · log' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </Screen>
  );
}
