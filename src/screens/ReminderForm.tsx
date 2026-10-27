import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { deleteReminder, getReminder, saveReminder } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';

const PRESETS = [
  { name: 'Engine oil & filter', match: '(oil|minyak hitam)' },
  { name: 'Brake fluid', match: 'brake fluid' },
  { name: 'Spark plugs', match: 'plug' },
  { name: 'Tyre rotation', match: 'rotat' },
  { name: 'Air filter', match: 'air filter' },
  { name: 'Coolant', match: 'coolant' },
];

function int(v: string): number | null {
  const n = Number(v.replace(/[,\s]/g, ''));
  return v.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : null;
}

export function ReminderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { vehicle } = useVehicle();
  const existing = useQuery(() => (id ? getReminder(id) : Promise.resolve(null)), [id]);

  const [name, setName] = useState('');
  const [months, setMonths] = useState('');
  const [kms, setKms] = useState('');
  const [lastOn, setLastOn] = useState('');
  const [lastKm, setLastKm] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [alertDays, setAlertDays] = useState('14');
  const [match, setMatch] = useState('');
  const [primary, setPrimary] = useState(false);
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const r = existing.data;
    if (!r || loaded.current) return;
    loaded.current = true;
    setName(r.name);
    setMonths(r.every_months ? String(r.every_months) : '');
    setKms(r.every_km ? String(r.every_km) : '');
    setLastOn(r.last_done_on ?? '');
    setLastKm(r.last_done_km !== null ? String(r.last_done_km) : '');
    setDueOn(r.due_on ?? '');
    setAlertDays(String(r.alert_days));
    setMatch(r.match ?? '');
    setPrimary(r.is_primary);
    setActive(r.active);
    setNotes(r.notes ?? '');
  }, [existing.data]);

  const valid = name.trim() !== '' && Boolean(vehicle) && (months === '' || int(months)) && (kms === '' || int(kms)) && (lastKm === '' || int(lastKm) !== null);

  async function save() {
    if (!valid || !vehicle) return;
    setBusy(true);
    setError(null);
    try {
      await saveReminder(id ?? null, {
        vehicle_id: existing.data?.vehicle_id ?? vehicle.id,
        name: name.trim(),
        every_months: int(months),
        every_km: int(kms),
        last_done_on: lastOn || null,
        last_done_km: int(lastKm),
        due_on: dueOn || null,
        alert_days: int(alertDays) ?? 14,
        match: match.trim() || null,
        is_primary: primary,
        active,
        notes: notes.trim() || null,
      });
      bump();
      toast('Saved');
      navigate(-1);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!id) return;
    setBusy(true);
    try {
      await deleteReminder(id);
      bump();
      toast('Deleted');
      navigate('/reminders', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setConfirm(false);
    }
  }

  const waiting = Boolean(id) && !existing.data && !existing.error;

  return (
    <Screen
      title={id ? 'Edit reminder' : 'New reminder'}
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
        {existing.error ? <ErrorNotice message={existing.error} onRetry={existing.reload} /> : null}
        {waiting ? <Loading /> : null}
        {!waiting ? (
          <>
            {!id ? (
              <div className="chips" role="group" aria-label="Common jobs">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    className={`chip ${name === p.name ? 'chip-on' : ''}`}
                    onClick={() => {
                      setName(p.name);
                      setMatch(p.match);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="group">
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Job</span>
                  <input placeholder="e.g. Engine oil & filter" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="group">
              <div className="group-header">How often (whichever comes first)</div>
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Every … months</span>
                  <input inputMode="numeric" placeholder="e.g. 6" value={months} onChange={(e) => setMonths(e.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">Every … km</span>
                  <input inputMode="numeric" placeholder="e.g. 10000" value={kms} onChange={(e) => setKms(e.target.value)} />
                </label>
              </div>
              <div className="group-footer">Use your service booklet or workshop's interval. Leave one blank to track by the other only.</div>
            </div>

            <div className="group">
              <div className="group-header">Last done</div>
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Date</span>
                  <input type="date" value={lastOn} onChange={(e) => setLastOn(e.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">Odometer</span>
                  <input inputMode="numeric" placeholder="km" value={lastKm} onChange={(e) => setLastKm(e.target.value)} />
                </label>
              </div>
              <div className="group-footer">Logging a service that matches this job resets these for you.</div>
            </div>

            <div className="group">
              <div className="group-header">Fixed date instead</div>
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Due on</span>
                  <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">Alert days before</span>
                  <input inputMode="numeric" value={alertDays} onChange={(e) => setAlertDays(e.target.value)} />
                </label>
              </div>
              <div className="group-footer">For one-off dates like a warranty end. A fixed date overrides "every … months".</div>
            </div>

            <div className="group">
              <div className="group-body">
                <label className="row">
                  <span className="row-label">
                    Show on Garage
                    <span className="row-sub">The big "next service" bars</span>
                  </span>
                  <span className="switch">
                    <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
                    <span className="switch-track" />
                  </span>
                </label>
                <label className="row">
                  <span className="row-label">Active</span>
                  <span className="switch">
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                    <span className="switch-track" />
                  </span>
                </label>
                <label className="row-input">
                  <span className="row-label">Match words</span>
                  <input placeholder="e.g. oil" value={match} onChange={(e) => setMatch(e.target.value)} />
                </label>
                <label className="row-input row-input-multiline">
                  <span className="row-label">Notes</span>
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>
              <div className="group-footer">Match words: a service whose name or items contain these resets the reminder.</div>
            </div>

            {error ? (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="sticky-save">
              <button className="button button-primary button-block" disabled={!valid || busy} onClick={save}>
                {busy ? 'Saving…' : 'Save reminder'}
              </button>
            </div>
            {id ? (
              <button className="button button-danger button-block" disabled={busy} onClick={() => setConfirm(true)}>
                Delete reminder
              </button>
            ) : null}
          </>
        ) : null}
      </main>
      {confirm ? (
        <ConfirmSheet title="Delete this reminder?" confirmLabel="Delete reminder" danger onConfirm={remove} onCancel={() => setConfirm(false)} />
      ) : null}
    </Screen>
  );
}
