import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { deleteTrip, getSettings, getTrip, listReadings, saveTrip } from '../api';
import { PlacePicker } from '../components/PlacePicker';
import { Icon } from '../components/Icon';
import { officeOf, placeName, roadKm, tripDestination, type Pt } from '../lib/places';
import { tripKm } from '../lib/trips';
import { latestReading } from '../lib/stats';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { mapLinks } from '../lib/geo';

/** ISO timestamp -> value for <input type="datetime-local">, in Malaysia time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return new Date(Date.parse(`${v}:00+08:00`)).toISOString();
}

function int(v: string): number | null {
  const n = Number(v.replace(/[,\s]/g, ''));
  return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function TripForm() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { vehicle } = useVehicle();
  const existing = useQuery(() => (isNew ? Promise.resolve(null) : getTrip(id!)), [id]);
  const readings = useQuery(() => (isNew && vehicle ? listReadings(vehicle.id) : Promise.resolve([])), [isNew, vehicle?.id]);

  const [started, setStarted] = useState(toLocalInput(new Date().toISOString()));
  const [ended, setEnded] = useState('');
  const [purpose, setPurpose] = useState<'private' | 'work'>('private');
  const [client, setClient] = useState('');
  const [distance, setDistance] = useState('');
  const [startOdo, setStartOdo] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [notes, setNotes] = useState('');
  // Work claim: office <-> destination
  const settings = useQuery(getSettings, []);
  const office = officeOf(settings.data);
  const [dest, setDest] = useState<(Pt & { label: string | null }) | null>(null);
  const [officeKm, setOfficeKm] = useState<number | null>(null);
  const [roundTrip, setRoundTrip] = useState(false);
  const [claimText, setClaimText] = useState('');
  const [picking, setPicking] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const autoMeasured = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const t = existing.data;
    if (!t || loaded.current) return;
    loaded.current = true;
    setStarted(toLocalInput(t.started_at));
    setEnded(toLocalInput(t.ended_at));
    setPurpose(t.purpose);
    setClient(t.client ?? '');
    setDistance(t.distance_km !== null ? String(t.distance_km) : '');
    setStartOdo(t.start_odo !== null ? String(t.start_odo) : '');
    setEndOdo(t.end_odo !== null ? String(t.end_odo) : '');
    setNotes(t.notes ?? '');
    if (t.dest_lat !== null && t.dest_lng !== null) setDest({ lat: t.dest_lat, lng: t.dest_lng, label: t.dest_label });
    setOfficeKm(t.office_km);
    setRoundTrip(t.claim_return);
    setClaimText(t.claim_source === 'manual' && t.claim_km !== null ? String(t.claim_km) : '');
  }, [existing.data]);

  async function measure(to: Pt & { label: string | null }) {
    setDest(to);
    setPicking(false);
    setClaimError(null);
    if (!office) return;
    setMeasuring(true);
    try {
      setOfficeKm(await roadKm(office, to));
    } catch (err) {
      setOfficeKm(null);
      setClaimError(errorMessage(err));
    } finally {
      setMeasuring(false);
    }
  }

  // A work trip with GPS ends: measure from the office to the far end straight away.
  useEffect(() => {
    const t = existing.data;
    if (purpose !== 'work' || !office || !t || dest || autoMeasured.current) return;
    const far = tripDestination(t, office);
    if (!far) return;
    autoMeasured.current = true;
    void (async () => {
      const label = await placeName(far).catch(() => null);
      await measure({ ...far, label });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose, office?.lat, office?.lng, existing.data, dest]);

  // A new trip starts from the latest odometer Garage knows, like trips started by CarPlay.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!isNew || prefilled.current || !readings.data) return;
    prefilled.current = true;
    const latest = latestReading(readings.data);
    if (latest) setStartOdo((v) => v || String(latest.km));
  }, [isNew, readings.data]);

  const s = int(startOdo);
  const e = int(endOdo);
  const fromOdo = s !== null && e !== null && e > s ? e - s : null;
  const distN = distance.trim() === '' ? null : Number(distance);
  const claimTyped = claimText.trim() === '' ? null : Number(claimText);
  const fromOffice = officeKm !== null ? Math.round(officeKm * (roundTrip ? 2 : 1) * 10) / 10 : null;
  const valid = (claimTyped === null || (Number.isFinite(claimTyped) && claimTyped >= 0)) && Boolean(started) && (distN === null || (Number.isFinite(distN) && distN >= 0)) && Boolean(vehicle);

  async function save() {
    if (!valid || !vehicle) return;
    setBusy(true);
    setError(null);
    try {
      const t = existing.data;
      // A distance typed by hand wins; otherwise the odometer difference; otherwise keep GPS.
      const typed = distN !== null && (!t || distN !== t.distance_km);
      const distance_km = typed ? distN : fromOdo ?? t?.distance_km ?? null;
      const distance_source = typed ? 'manual' : fromOdo !== null && !t?.distance_km ? 'odometer' : t?.distance_source ?? null;
      await saveTrip(isNew ? null : id!, {
        vehicle_id: t?.vehicle_id ?? vehicle.id,
        started_at: fromLocalInput(started)!,
        ended_at: fromLocalInput(ended),
        purpose,
        client: client.trim() || null,
        distance_km,
        distance_source,
        start_odo: s,
        end_odo: e,
        notes: notes.trim() || null,
        dest_label: dest?.label ?? null,
        dest_lat: dest?.lat ?? null,
        dest_lng: dest?.lng ?? null,
        office_km: dest ? officeKm : null,
        claim_return: roundTrip,
        claim_km: claimTyped ?? (dest ? fromOffice : null),
        claim_source: claimTyped !== null ? 'manual' : dest && fromOffice !== null ? 'office' : null,
      });
      bump();
      toast('Saved');
      navigate(-1);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (isNew) return;
    setBusy(true);
    try {
      await deleteTrip(id!);
      bump();
      toast('Trip deleted');
      navigate('/trips', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      setConfirm(false);
    }
  }

  const t = existing.data;
  const waiting = !isNew && !t && !existing.error;

  return (
    <Screen
      title={isNew ? 'New trip' : 'Trip'}
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
            <div className="segmented segmented-2" role="group" aria-label="Purpose">
              <button aria-pressed={purpose === 'private'} onClick={() => setPurpose('private')}>
                Private
              </button>
              <button aria-pressed={purpose === 'work'} onClick={() => setPurpose('work')}>
                Work
              </button>
            </div>

            <div className="group">
              <div className="group-body">
                {purpose === 'work' ? (
                  <label className="row-input">
                    <span className="row-label">Client / category</span>
                    <input placeholder="e.g. Sime Darby, site visit" value={client} onChange={(ev) => setClient(ev.target.value)} />
                  </label>
                ) : null}
                <label className="row-input">
                  <span className="row-label">Started</span>
                  <input type="datetime-local" value={started} onChange={(ev) => setStarted(ev.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">Ended</span>
                  <input type="datetime-local" value={ended} onChange={(ev) => setEnded(ev.target.value)} />
                </label>
              </div>
            </div>

            {purpose === 'work' ? (
              <div className="group">
                <div className="group-header">Claim</div>
                <div className="group-body">
                  <button className="row" onClick={() => setPicking((v) => !v)}>
                    <span className="row-label">
                      Destination
                      <span className="row-sub">{dest ? dest.label ?? `${dest.lat.toFixed(5)}, ${dest.lng.toFixed(5)}` : 'Where the work was'}</span>
                    </span>
                    <span className="row-value">{measuring ? 'Measuring…' : officeKm !== null && dest ? `${officeKm.toFixed(1)} km` : picking ? 'Close' : dest ? '' : 'Pick'}</span>
                    <Icon name="chevron-right" size={18} />
                  </button>
                  <label className="row">
                    <span className="row-label">
                      Return to office too
                      <span className="row-sub">For a there-and-back trip logged as one (×2)</span>
                    </span>
                    <span className="switch">
                      <input type="checkbox" checked={roundTrip} onChange={(ev) => setRoundTrip(ev.target.checked)} />
                      <span className="switch-track" />
                    </span>
                  </label>
                  <label className="row-input">
                    <span className="row-label">Claim (km)</span>
                    <input
                      inputMode="decimal"
                      placeholder={fromOffice !== null ? fromOffice.toFixed(1) : (() => { const d = t ? tripKm(t) : fromOdo; return d !== null && d !== undefined ? String(d) : 'km'; })()}
                      value={claimText}
                      onChange={(ev) => setClaimText(ev.target.value)}
                    />
                  </label>
                </div>
                {picking ? (
                  <PlacePicker
                    near={office}
                    placeholder="Search the client's building or area"
                    shortcuts={[
                      ...(t && t.end_lat !== null && t.end_lng !== null ? [{ label: 'Where this trip ended', place: { lat: t.end_lat, lng: t.end_lng } }] : []),
                      ...(t && t.start_lat !== null && t.start_lng !== null ? [{ label: 'Where this trip started', place: { lat: t.start_lat, lng: t.start_lng } }] : []),
                    ]}
                    onPick={(p) => void measure(p)}
                  />
                ) : null}
                {claimError ? (
                  <div className="notice notice-error" role="alert">
                    {claimError}
                  </div>
                ) : null}
                <div className="group-footer">
                  {office ? (
                    <>
                      Measured by road from {office.label} to the destination{roundTrip ? ' and back' : ', one way'}, wherever you actually set off.
                      {claimTyped !== null ? ' Your typed km is used instead.' : ''}
                      {!dest ? ' Without a destination, the km you drove is claimed.' : ''}
                    </>
                  ) : (
                    <>
                      The km you drove is claimed. <Link to="/settings/office">Set your office</Link> to claim office ↔ destination instead.
                    </>
                  )}
                </div>
              </div>
            ) : null}

            <div className="group">
              <div className="group-header">Distance</div>
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Distance driven (km)</span>
                  <input inputMode="decimal" placeholder={fromOdo !== null ? String(fromOdo) : '0.0'} value={distance} onChange={(ev) => setDistance(ev.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">Start odometer</span>
                  <input inputMode="numeric" placeholder="km" value={startOdo} onChange={(ev) => setStartOdo(ev.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">End odometer</span>
                  <input inputMode="numeric" placeholder="km" value={endOdo} onChange={(ev) => setEndOdo(ev.target.value)} />
                </label>
              </div>
              <div className="group-footer">
                {t?.distance_source === 'gps' ? 'Measured by GPS while Garage was open. ' : ''}
                {t?.source === 'shortcut' && t.distance_km === null ? 'CarPlay trips record the time and place; add the km or both odometer readings. ' : ''}
                Fill in either the distance or both odometer readings. The end odometer also updates the odometer on your Garage card.
                {s !== null && e !== null && e < s ? <strong className="is-bad-text"> The end odometer is lower than the start.</strong> : null}
              </div>
            </div>

            {t && (t.start_lat !== null || t.end_lat !== null) ? (
              <div className="group">
                <div className="group-header">Places</div>
                <div className="workshop-actions">
                  {t.start_lat !== null && t.start_lng !== null ? (
                    <a className="action-chip" href={mapLinks(t.start_lat, t.start_lng, 'Trip start').google} target="_blank" rel="noreferrer">
                      Start on map
                    </a>
                  ) : null}
                  {t.end_lat !== null && t.end_lng !== null ? (
                    <a className="action-chip" href={mapLinks(t.end_lat, t.end_lng, 'Trip end').google} target="_blank" rel="noreferrer">
                      End on map
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="group">
              <div className="group-body">
                <label className="row-input row-input-multiline">
                  <span className="row-label">Notes</span>
                  <textarea rows={2} value={notes} onChange={(ev) => setNotes(ev.target.value)} />
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
                {busy ? 'Saving…' : 'Save trip'}
              </button>
            </div>
            {!isNew ? (
              <button className="button button-danger button-block" disabled={busy} onClick={() => setConfirm(true)}>
                Delete trip
              </button>
            ) : null}
          </>
        ) : null}
      </main>
      {confirm ? <ConfirmSheet title="Delete this trip?" confirmLabel="Delete trip" danger onConfirm={remove} onCancel={() => setConfirm(false)} /> : null}
    </Screen>
  );
}
