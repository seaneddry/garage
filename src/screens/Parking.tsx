import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { addParking, deleteParking, listParking, updateParking, uploadParkingPhoto } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { usePhotoUrl, useVehicle } from '../lib/vehicle';
import { ago, currentFix, mapLinks, timeLabel } from '../lib/geo';
import { prepareFile } from '../lib/scan';
import type { Parking as Spot } from '../types';

export function Parking() {
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { vehicle } = useVehicle();
  const vid = vehicle?.id ?? '';
  const spots = useQuery(() => (vid ? listParking(vid) : Promise.resolve([] as Spot[])), [vid]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = spots.data?.[0] ?? null;
  const older = (spots.data ?? []).slice(1);

  async function parkHere() {
    if (!vehicle) return;
    setBusy(true);
    setError(null);
    try {
      const fix = await currentFix();
      await addParking({ vehicle_id: vehicle.id, lat: fix.lat, lng: fix.lng, accuracy_m: Math.round(fix.accuracy), bay: null, note: null, photo_path: null });
      bump();
      toast('Parking spot saved');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Parking"
      compact
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} />
          Back
        </button>
      }
    >
      <main className="page stack">
        <button className="button button-primary button-block" disabled={busy || !vehicle} onClick={parkHere}>
          {busy ? 'Getting location…' : 'I parked here'}
        </button>
        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}

        {spots.error ? <ErrorNotice message={spots.error} onRetry={spots.reload} /> : null}
        {!spots.data && !spots.error ? <Loading /> : null}
        {spots.data && !current ? (
          <div className="notice">
            No parking spot saved yet. Tap the button when you park, or set up the CarPlay Shortcut in{' '}
            <Link to="/settings/shortcuts">Settings → Shortcuts</Link> to save it when you switch off.
          </div>
        ) : null}

        {current ? <CurrentSpot key={current.id} spot={current} onChange={bump} /> : null}

        {older.length > 0 ? (
          <section className="group">
            <div className="group-header">Earlier</div>
            <div className="group-body">
              {older.map((p) => (
                <div className="tx-row" key={p.id}>
                  <span className="tx-main">
                    <span className="tx-title">{timeLabel(p.parked_at)}</span>
                    <span className="tx-sub">{[p.bay, p.source === 'shortcut' ? 'CarPlay' : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  {p.lat !== null && p.lng !== null ? (
                    <a className="action-chip" href={mapLinks(p.lat, p.lng).google} target="_blank" rel="noreferrer">
                      Map
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </Screen>
  );
}

function CurrentSpot({ spot, onChange }: { spot: Spot; onChange: () => void }) {
  const toast = useToast();
  const [bay, setBay] = useState(spot.bay ?? '');
  const [note, setNote] = useState(spot.note ?? '');
  const [busy, setBusy] = useState(false);
  const photo = usePhotoUrl(spot.photo_path);
  const fileInput = useRef<HTMLInputElement>(null);
  const links = spot.lat !== null && spot.lng !== null ? mapLinks(spot.lat, spot.lng) : null;

  useEffect(() => {
    setBay(spot.bay ?? '');
    setNote(spot.note ?? '');
  }, [spot.bay, spot.note]);

  async function saveText() {
    if ((bay.trim() || null) === spot.bay && (note.trim() || null) === spot.note) return;
    try {
      await updateParking(spot.id, { bay: bay.trim() || null, note: note.trim() || null });
      onChange();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const p = await prepareFile(file);
      const path = await uploadParkingPhoto(p.blob);
      await updateParking(spot.id, { photo_path: path });
      onChange();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function share() {
    if (!links) return;
    const text = `My car is parked here${bay ? ` (${bay})` : ''}: ${links.google}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Where I parked', text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Copied');
      }
    } catch {
      /* closed the share sheet */
    }
  }

  async function remove() {
    try {
      await deleteParking(spot);
      onChange();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <section className="parking-card">
      <div className="parking-head">
        <span className="kpi-label">Parked {ago(spot.parked_at)}</span>
        <span className="tx-sub">
          {timeLabel(spot.parked_at)}
          {spot.accuracy_m ? ` · ±${Math.round(spot.accuracy_m)} m` : ''}
          {spot.source === 'shortcut' ? ' · saved by CarPlay' : ''}
        </span>
      </div>

      {photo ? <img className="parking-photo" src={photo} alt="Where the car is parked" /> : null}

      <div className="group-body">
        <label className="row-input">
          <span className="row-label">Bay / level</span>
          <input placeholder="e.g. B2, pillar 14" value={bay} onChange={(e) => setBay(e.target.value)} onBlur={saveText} />
        </label>
        <label className="row-input">
          <span className="row-label">Note</span>
          <input placeholder="e.g. near lift lobby" value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveText} />
        </label>
      </div>

      {links ? (
        <div className="workshop-actions">
          <a className="action-chip" href={links.apple} target="_blank" rel="noreferrer">
            Apple Maps
          </a>
          <a className="action-chip" href={links.google} target="_blank" rel="noreferrer">
            Google Maps
          </a>
          <a className="action-chip" href={links.waze} target="_blank" rel="noreferrer">
            Waze
          </a>
          <button className="action-chip" onClick={() => void share()}>
            Share
          </button>
        </div>
      ) : null}

      <div className="workshop-actions">
        <button className="button button-secondary button-small" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'Saving photo…' : photo ? 'Replace photo' : 'Photo of the sign'}
        </button>
        <button className="button button-quiet button-small" onClick={() => void remove()}>
          Clear
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
    </section>
  );
}
