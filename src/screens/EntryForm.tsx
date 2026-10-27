import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { deleteEntry, getCostByEntry, getCostByTransaction, listEntryItems, listPlaces, listReadings, listWorkshops, saveEntry, setExcluded } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { parseAmount, rm, todayKL } from '../lib/format';
import { FUEL_GRADES, KINDS, KIND_SHORT, STATIONS } from '../lib/kinds';
import { latestReading } from '../lib/stats';
import { km } from '../lib/reminders';
import type { Cost, EntryItem, EntryKind } from '../types';

interface ItemDraft {
  key: number;
  name: string;
  amount: string;
}

const TITLE_HINT: Record<EntryKind, string> = {
  fuel: 'Petrol',
  service: 'e.g. Engine oil service',
  care: 'Car wash',
  renewal: 'e.g. Road tax',
  other: 'e.g. Window tint',
};

/**
 * One screen for logging a cost (/log), editing one (/entry/:id) and adding car details
 * to an expense logged in the Expense Tracker (/link/:transactionId).
 */
export function EntryForm() {
  const { id, transactionId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { vehicle: currentVehicle, vehicles } = useVehicle();

  const mode: 'new' | 'edit' | 'link' = id ? 'edit' : transactionId ? 'link' : 'new';
  const existing = useQuery<Cost | null>(
    () => (id ? getCostByEntry(id) : transactionId ? getCostByTransaction(transactionId) : Promise.resolve(null)),
    [id, transactionId],
  );
  const items = useQuery<EntryItem[]>(() => (id ? listEntryItems(id) : Promise.resolve([])), [id]);
  const places = useQuery(listPlaces, []);
  const workshops = useQuery(listWorkshops, []);

  const [vehicleId, setVehicleId] = useState(currentVehicle?.id ?? '');
  const readings = useQuery(() => (vehicleId ? listReadings(vehicleId) : Promise.resolve([])), [vehicleId]);
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? currentVehicle;

  const [kind, setKind] = useState<EntryKind>((params.get('kind') as EntryKind) || 'fuel');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayKL());
  const [title, setTitle] = useState('');
  const [odometer, setOdometer] = useState('');
  const [litres, setLitres] = useState('');
  const [grade, setGrade] = useState<string>('');
  const [fullTank, setFullTank] = useState(true);
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ItemDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'delete' | 'exclude' | null>(null);
  const loaded = useRef(false);
  const nextKey = useRef(1);

  useEffect(() => {
    if (!vehicleId && currentVehicle) setVehicleId(currentVehicle.id);
  }, [currentVehicle, vehicleId]);

  useEffect(() => {
    if (!grade && vehicle?.fuel_grade && mode === 'new') setGrade(vehicle.fuel_grade);
  }, [vehicle, grade, mode]);

  // Fill the form once from the record or the expense being linked.
  useEffect(() => {
    const c = existing.data;
    if (!c || loaded.current || (id && !items.data)) return;
    loaded.current = true;
    setKind(c.kind);
    setAmount(c.amount !== null ? String(c.amount) : c.removed_amount !== null ? String(c.removed_amount) : '');
    setDate(c.occurred_on);
    const generic = c.kind === 'fuel' && /^petrol$/i.test(c.title);
    setTitle(generic ? '' : c.title);
    if (c.vehicle_id) setVehicleId(c.vehicle_id);
    setOdometer(c.odometer_km !== null ? String(c.odometer_km) : '');
    setLitres(c.litres !== null ? String(c.litres) : '');
    setGrade(c.fuel_grade ?? (c.entry_id ? '' : vehicle?.fuel_grade ?? ''));
    setFullTank(c.full_tank ?? true);
    setPlace(c.place ?? '');
    setNotes(c.notes ?? '');
    setLines((items.data ?? []).map((i) => ({ key: nextKey.current++, name: i.name, amount: i.amount !== null ? String(i.amount) : '' })));
  }, [existing.data, items.data, id, vehicle]);

  const parsed = parseAmount(amount);
  const litresN = parseAmount(litres);
  const odoN = odometer.trim() === '' ? null : Number(odometer.replace(/[,\s]/g, ''));
  const latest = useMemo(() => latestReading(readings.data ?? []), [readings.data]);
  const odoValid = odoN === null || (Number.isInteger(odoN) && odoN >= 0);
  const valid = parsed !== null && parsed >= 0 && date !== '' && Boolean(vehicleId) && odoValid && (litres.trim() === '' || (litresN !== null && litresN > 0));
  const perLitre = parsed && litresN ? parsed / litresN : null;
  const odoLow = odoN !== null && latest && odoN < latest.km && mode === 'new';

  const placeOptions =
    kind === 'fuel'
      ? STATIONS
      : [...new Set([...(workshops.data ?? []).map((w) => w.name), ...(places.data ?? []).filter((p) => !STATIONS.includes(p))])].slice(0, 8);

  function leave() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/', { replace: true });
  }

  async function save() {
    if (!valid || parsed === null) return;
    setBusy(true);
    setError(null);
    try {
      await saveEntry({
        id: id,
        transaction_id: existing.data?.transaction_id ?? null,
        vehicle_id: vehicleId,
        kind,
        occurred_on: date,
        amount: parsed,
        title: title.trim() || null,
        odometer_km: odoN,
        litres: kind === 'fuel' ? litresN : null,
        fuel_grade: kind === 'fuel' ? grade || null : null,
        full_tank: kind === 'fuel' ? fullTank : true,
        place: place.trim() || null,
        notes: notes.trim() || null,
        items: kind === 'fuel' ? [] : lines.map((l) => ({ name: l.name, amount: parseAmount(l.amount) })),
      });
      bump();
      toast(mode === 'link' ? 'Details added' : mode === 'edit' ? 'Saved' : `Logged ${rm(parsed)} · also in Expenses`);
      navigate(mode === 'new' ? '/' : '/history', { replace: true, viewTransition: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove(withExpense: boolean) {
    if (!id) return;
    setBusy(true);
    try {
      await deleteEntry(id, withExpense);
      bump();
      toast(withExpense ? 'Deleted here and in Expenses' : 'Car details removed');
      navigate('/history', { replace: true, viewTransition: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setSheet(null);
    }
  }

  async function exclude() {
    if (!existing.data?.transaction_id) return;
    setBusy(true);
    try {
      await setExcluded(existing.data.transaction_id, true);
      bump();
      toast('Hidden from Garage');
      navigate('/history', { replace: true, viewTransition: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setSheet(null);
    }
  }

  const waiting = mode !== 'new' && (!existing.data || (mode === 'edit' && !items.data)) && !existing.error;
  const missing = mode !== 'new' && existing.data === null;
  const screenTitle = mode === 'edit' ? 'Edit record' : mode === 'link' ? 'Add car details' : 'Log a cost';

  return (
    <Screen
      title={screenTitle}
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={leave}>
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
        {missing ? <ErrorNotice message="This record no longer exists." /> : null}
        {waiting ? <Loading /> : null}

        {!waiting && !missing ? (
          <>
            {mode === 'link' ? (
              <div className="notice">
                Logged in the Expense Tracker. Add the car details here; the amount and date stay in sync with that expense.
              </div>
            ) : null}
            {existing.data?.cost_removed ? (
              <div className="notice notice-warn">
                This expense was deleted in the Expense Tracker. Saving adds it back there.
              </div>
            ) : null}

            <div className="segmented segmented-5" role="group" aria-label="Type">
              {KINDS.map((k) => (
                <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {KIND_SHORT[k]}
                </button>
              ))}
            </div>

            <div className="amount-field">
              <span className="currency">RM</span>
              <input
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Amount in ringgit"
                autoFocus={mode === 'new'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {vehicles.length > 1 ? (
              <div className="chips" role="group" aria-label="Car">
                {vehicles.map((v) => (
                  <button key={v.id} className={`chip ${v.id === vehicleId ? 'chip-on' : ''}`} onClick={() => setVehicleId(v.id)}>
                    {v.plate || v.model}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="group">
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">{kind === 'fuel' ? 'Name' : 'What'}</span>
                  <input placeholder={TITLE_HINT[kind]} value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">Date</span>
                  <input type="date" value={date} max={todayKL()} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">Odometer</span>
                  <input
                    inputMode="numeric"
                    placeholder={latest ? `last ${km(latest.km)}` : 'km'}
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                  />
                </label>
                {kind === 'fuel' ? (
                  <>
                    <label className="row-input">
                      <span className="row-label">Litres</span>
                      <input inputMode="decimal" placeholder="0.0" value={litres} onChange={(e) => setLitres(e.target.value)} />
                    </label>
                    <label className="row">
                      <span className="row-label">
                        Filled to full
                        <span className="row-sub">Needed for accurate L/100 km</span>
                      </span>
                      <span className="switch">
                        <input type="checkbox" checked={fullTank} onChange={(e) => setFullTank(e.target.checked)} />
                        <span className="switch-track" />
                      </span>
                    </label>
                  </>
                ) : null}
              </div>
              {odoLow ? <div className="group-footer">Lower than your last reading ({km(latest!.km)} km). Check the number.</div> : null}
              {perLitre ? <div className="group-footer">{rm(perLitre)} per litre</div> : null}
            </div>

            {kind === 'fuel' ? (
              <div className="group">
                <div className="group-header">Fuel</div>
                <div className="chips" role="group" aria-label="Fuel grade">
                  {FUEL_GRADES.map((g) => (
                    <button key={g} className={`chip ${grade === g ? 'chip-on' : ''}`} onClick={() => setGrade(grade === g ? '' : g)}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="group">
              <div className="group-header">{kind === 'fuel' ? 'Station' : 'Where'}</div>
              {placeOptions.length > 0 ? (
                <div className="chips" role="group" aria-label={kind === 'fuel' ? 'Station' : 'Recent places'}>
                  {placeOptions.map((p) => (
                    <button key={p} className={`chip ${place === p ? 'chip-on' : ''}`} onClick={() => setPlace(place === p ? '' : p)}>
                      {p}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">{kind === 'fuel' ? 'Station' : 'Workshop'}</span>
                  <input
                    list="place-options"
                    placeholder={kind === 'fuel' ? 'e.g. Petronas Rawang' : 'Name'}
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                  />
                </label>
                <datalist id="place-options">
                  {(places.data ?? []).map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>

            {kind !== 'fuel' ? (
              <div className="group">
                <div className="group-header">Items (optional)</div>
                <div className="group-body">
                  {lines.map((l, i) => (
                    <div className="row-input item-row" key={l.key}>
                      <input
                        aria-label={`Item ${i + 1}`}
                        placeholder="e.g. Oil filter"
                        value={l.name}
                        onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)))}
                      />
                      <input
                        className="item-amount"
                        aria-label={`Item ${i + 1} price`}
                        inputMode="decimal"
                        placeholder="RM"
                        value={l.amount}
                        onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, amount: e.target.value } : x)))}
                      />
                      <button className="icon-button" aria-label={`Remove item ${i + 1}`} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                        <Icon name="x" size={18} />
                      </button>
                    </div>
                  ))}
                  <button className="row row-button" onClick={() => setLines([...lines, { key: nextKey.current++, name: '', amount: '' }])}>
                    <Icon name="plus" size={18} />
                    <span className="row-label">Add item</span>
                  </button>
                </div>
                <div className="group-footer">Items are for your records. The amount above is what goes to Expenses.</div>
              </div>
            ) : null}

            <div className="group">
              <div className="group-body">
                <label className="row-input row-input-multiline">
                  <span className="row-label">Notes</span>
                  <textarea rows={2} maxLength={1000} placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>
            </div>

            {error ? (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="sticky-save">
              <button className="button button-primary button-block" disabled={!valid || busy} onClick={save}>
                {busy ? 'Saving…' : mode === 'new' ? 'Log it' : 'Save'}
              </button>
            </div>

            {mode === 'edit' ? (
              <button className="button button-danger button-block" disabled={busy} onClick={() => setSheet('delete')}>
                Delete record
              </button>
            ) : null}
            {mode === 'link' ? (
              <button className="button button-secondary button-block" disabled={busy} onClick={() => setSheet('exclude')}>
                Not for my car
              </button>
            ) : null}
          </>
        ) : null}
      </main>

      {sheet === 'delete' ? (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="action-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="action-group">
              <div className="action-title">
                {existing.data?.cost_removed
                  ? 'Delete this record? Its expense is already gone.'
                  : 'Delete the expense too? It is also in your Expense Tracker.'}
              </div>
              {!existing.data?.cost_removed ? (
                <button className="action action-danger" onClick={() => remove(true)}>
                  Delete here and in Expenses
                </button>
              ) : null}
              <button className={`action ${existing.data?.cost_removed ? 'action-danger' : ''}`} onClick={() => remove(false)}>
                {existing.data?.cost_removed ? 'Delete record' : 'Remove car details only'}
              </button>
            </div>
            <button className="action action-cancel" onClick={() => setSheet(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {sheet === 'exclude' ? (
        <ConfirmSheet
          title="Hide this expense from Garage? It stays in your Expense Tracker. Use it for a friend's car or a rental."
          confirmLabel="Hide from Garage"
          onConfirm={exclude}
          onCancel={() => setSheet(null)}
        />
      ) : null}
    </Screen>
  );
}
