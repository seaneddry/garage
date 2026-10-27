import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ErrorNotice } from '../components/States';
import { useToast } from '../components/Toast';
import { deleteVehicle, removeVehiclePhoto, saveVehicle, setDefaultVehicle, uploadVehiclePhoto } from '../api';
import { errorMessage, useBump } from '../lib/useQuery';
import { usePhotoUrl, useVehicle } from '../lib/vehicle';
import { FUEL_GRADES } from '../lib/kinds';

export function CarForm() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { vehicles, reload } = useVehicle();
  const car = isNew ? null : vehicles.find((v) => v.id === id) ?? null;
  const photo = usePhotoUrl(car?.photo_path);

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [tank, setTank] = useState('');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const loaded = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!car || loaded.current) return;
    loaded.current = true;
    setMake(car.make);
    setModel(car.model);
    setVariant(car.variant ?? '');
    setYear(car.year ? String(car.year) : '');
    setPlate(car.plate ?? '');
    setTank(car.tank_litres ? String(car.tank_litres) : '');
    setGrade(car.fuel_grade ?? '');
  }, [car]);

  const yearN = year.trim() === '' ? null : Number(year);
  const tankN = tank.trim() === '' ? null : Number(tank);
  const valid =
    make.trim() !== '' &&
    model.trim() !== '' &&
    (yearN === null || (Number.isInteger(yearN) && yearN >= 1950 && yearN <= 2100)) &&
    (tankN === null || (Number.isFinite(tankN) && tankN > 0));

  function refresh() {
    reload();
    bump();
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await saveVehicle(
        car?.id ?? null,
        {
          make: make.trim(),
          model: model.trim(),
          variant: variant.trim() || null,
          year: yearN,
          plate: plate.trim().toUpperCase() || null,
          tank_litres: tankN,
          fuel_grade: grade || null,
        },
        vehicles.length === 0,
      );
      refresh();
      toast('Saved');
      navigate(-1);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file || !car) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('That photo is over 10 MB. Pick a smaller one.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadVehiclePhoto(car, file);
      refresh();
      toast('Photo updated');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function clearPhoto() {
    if (!car) return;
    setBusy(true);
    try {
      await removeVehiclePhoto(car);
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault() {
    if (!car) return;
    setBusy(true);
    try {
      await setDefaultVehicle(car.id);
      refresh();
      toast('Main car set');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!car) return;
    setBusy(true);
    try {
      await deleteVehicle(car.id);
      refresh();
      toast('Car removed');
      navigate('/settings', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setConfirm(false);
    }
  }

  if (!isNew && !car) {
    return (
      <Screen title="Car" compact className="screen-form" left={<button className="nav-button" onClick={() => navigate(-1)}>Back</button>}>
        <main className="page stack">
          <ErrorNotice message="This car no longer exists." />
        </main>
      </Screen>
    );
  }

  return (
    <Screen
      title={isNew ? 'Add a car' : 'Car details'}
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
        {car ? (
          <div className="group">
            <div className="group-header">Photo</div>
            <div className="photo-edit">
              {photo ? <img src={photo} alt="" /> : <div className="photo-edit-empty"><Icon name="image" size={28} /></div>}
              <div className="photo-edit-actions">
                <button className="button button-secondary button-small" disabled={busy} onClick={() => fileInput.current?.click()}>
                  {photo ? 'Replace photo' : 'Choose photo'}
                </button>
                {photo ? (
                  <button className="button button-quiet button-small" disabled={busy} onClick={clearPhoto}>
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => onPhoto(e.target.files?.[0])}
              />
            </div>
            <div className="group-footer">A PNG with a transparent background, side or three-quarter view, looks best (about 1200 × 600).</div>
          </div>
        ) : null}

        <div className="group">
          <div className="group-body">
            <label className="row-input">
              <span className="row-label">Make</span>
              <input placeholder="e.g. MINI" value={make} onChange={(e) => setMake(e.target.value)} />
            </label>
            <label className="row-input">
              <span className="row-label">Model</span>
              <input placeholder="e.g. Cooper S Countryman" value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label className="row-input">
              <span className="row-label">Variant</span>
              <input placeholder="Optional" value={variant} onChange={(e) => setVariant(e.target.value)} />
            </label>
            <label className="row-input">
              <span className="row-label">Year</span>
              <input inputMode="numeric" placeholder="e.g. 2018" value={year} onChange={(e) => setYear(e.target.value)} />
            </label>
            <label className="row-input">
              <span className="row-label">Plate</span>
              <input autoCapitalize="characters" placeholder="Optional" value={plate} onChange={(e) => setPlate(e.target.value)} />
            </label>
            <label className="row-input">
              <span className="row-label">Tank size (L)</span>
              <input inputMode="decimal" placeholder="Optional" value={tank} onChange={(e) => setTank(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="group">
          <div className="group-header">Usual fuel (pre-selected when you log)</div>
          <div className="chips" role="group" aria-label="Usual fuel">
            {FUEL_GRADES.map((g) => (
              <button key={g} className={`chip ${grade === g ? 'chip-on' : ''}`} onClick={() => setGrade(grade === g ? '' : g)}>
                {g}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="sticky-save">
          <button className="button button-primary button-block" disabled={!valid || busy} onClick={save}>
            {busy ? 'Saving…' : isNew ? 'Add car' : 'Save'}
          </button>
        </div>

        {car && !car.is_default ? (
          <button className="button button-secondary button-block" disabled={busy} onClick={makeDefault}>
            Make this my main car
          </button>
        ) : null}
        {car ? (
          <button className="button button-danger button-block" disabled={busy} onClick={() => setConfirm(true)}>
            Remove car
          </button>
        ) : null}
      </main>
      {confirm ? (
        <ConfirmSheet
          title="Remove this car and its Garage records? Its expenses stay in the Expense Tracker."
          confirmLabel="Remove car"
          danger
          onConfirm={remove}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </Screen>
  );
}
