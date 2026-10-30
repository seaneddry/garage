import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { PlacePicker } from '../components/PlacePicker';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { deletePlace, listSavedPlaces, savePlace, tagTripsAtPlace } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { mapLinks } from '../lib/geo';
import { officeOf, roadKm, type PlaceHit } from '../lib/places';
import type { Place } from '../types';

const KIND_TITLE: Record<Place['kind'], string> = { office: 'Office', home: 'Home', client: 'Client', other: 'Not work' };
const RADII = [100, 200, 500];

export function PlaceForm() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const places = useQuery(listSavedPlaces, []);
  const existing = isNew ? null : (places.data ?? []).find((p) => p.id === id) ?? null;
  const office = officeOf(places.data);

  const [kind, setKind] = useState<Place['kind']>((params.get('kind') as Place['kind']) || 'client');
  const [name, setName] = useState(params.get('name') ?? '');
  const [point, setPoint] = useState<PlaceHit | null>(
    params.get('lat') && params.get('lng')
      ? { lat: Number(params.get('lat')), lng: Number(params.get('lng')), label: params.get('name') ?? '', address: '' }
      : null,
  );
  const [radius, setRadius] = useState(200);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pastTrips, setPastTrips] = useState<{ id: string; n: number } | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!existing || loaded.current) return;
    loaded.current = true;
    setKind(existing.kind);
    setName(existing.name);
    setPoint({ lat: existing.lat, lng: existing.lng, label: existing.name, address: existing.address ?? '' });
    setRadius(existing.radius_m);
  }, [existing]);

  function pick(p: PlaceHit) {
    setPoint(p);
    setPicking(false);
    if (!name.trim() || name === point?.label) setName(p.label);
  }

  const valid = Boolean(point) && name.trim().length > 0;
  const moved = !existing || !point || existing.lat !== point.lat || existing.lng !== point.lng;

  async function save() {
    if (!point) return;
    setBusy(true);
    setError(null);
    try {
      let office_km = existing?.office_km ?? null;
      if (kind === 'client' && office && (moved || office_km === null)) {
        office_km = await roadKm(office, point).catch(() => null);
      }
      if (kind !== 'client') office_km = null;
      const pid = await savePlace(isNew ? null : id!, {
        kind,
        name: name.trim(),
        address: point.address || existing?.address || null,
        lat: point.lat,
        lng: point.lng,
        radius_m: radius,
        office_km,
      });
      // A new office location: re-measure every client from it.
      if (kind === 'office' && moved) {
        for (const c of (places.data ?? []).filter((p) => p.kind === 'client')) {
          const km = await roadKm(point, c).catch(() => null);
          await savePlace(c.id, { office_km: km });
        }
      }
      bump();
      toast('Saved');
      if (kind === 'client') {
        const n = await tagTripsAtPlace(pid, false).catch(() => 0);
        if (n > 0) {
          setPastTrips({ id: pid, n });
          setBusy(false);
          return;
        }
      }
      navigate(-1);
    } catch (e) {
      const msg = errorMessage(e);
      setError(/one_office|one_home/.test(msg) ? `You already have a ${kind}. Edit that one instead.` : msg);
      setBusy(false);
    }
  }

  async function tagPast() {
    if (!pastTrips) return;
    try {
      const n = await tagTripsAtPlace(pastTrips.id, true);
      bump();
      toast(`${n} trip${n === 1 ? '' : 's'} tagged Work`);
    } catch (e) {
      toast(errorMessage(e));
    }
    navigate(-1);
  }

  async function remove() {
    setBusy(true);
    try {
      await deletePlace(id!);
      bump();
      toast('Place removed');
      navigate(-1);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const waiting = !isNew && !existing && !places.error;
  const changeable = kind === 'client' || kind === 'other';

  return (
    <Screen
      title={isNew ? `New ${KIND_TITLE[kind].toLowerCase()}` : KIND_TITLE[kind]}
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          Cancel
        </button>
      }
      right={
        <button className="nav-button nav-button-strong" disabled={!valid || busy} onClick={() => void save()}>
          Save
        </button>
      }
    >
      <main className="page stack">
        {places.error ? <ErrorNotice message={places.error} onRetry={places.reload} /> : null}
        {waiting ? <Loading /> : null}
        {!waiting ? (
          <>
            {changeable ? (
              <div className="segmented segmented-2" role="group" aria-label="Kind">
                <button aria-pressed={kind === 'client'} onClick={() => setKind('client')}>
                  Client
                </button>
                <button aria-pressed={kind === 'other'} onClick={() => setKind('other')}>
                  Not work
                </button>
              </div>
            ) : null}

            <section className="group">
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Name</span>
                  <input
                    value={name}
                    placeholder={kind === 'client' ? 'e.g. Client HQ' : kind === 'office' ? 'e.g. Office' : 'Name'}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button className="row" onClick={() => setPicking((v) => !v)}>
                  <span className="row-label">
                    Location
                    <span className="row-sub">{point ? point.address || point.label || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : 'Search or use where you are now'}</span>
                  </span>
                  <span className="row-value">{picking ? 'Close' : point ? 'Change' : 'Pick'}</span>
                  <Icon name="chevron-right" size={18} />
                </button>
                {point ? (
                  <a className="row" href={mapLinks(point.lat, point.lng, name || 'Place').google} target="_blank" rel="noreferrer">
                    <span className="row-label">Show on map</span>
                    <Icon name="external" size={18} />
                  </a>
                ) : null}
              </div>
              {picking || !point ? (
                <PlacePicker
                  near={kind === 'office' ? null : office}
                  placeholder={kind === 'client' ? "Search the client's building or area" : 'Search a building or address'}
                  onPick={pick}
                />
              ) : null}
            </section>

            {kind !== 'office' ? (
              <section className="group">
                <div className="group-header">Counts as here within</div>
                <div className={`segmented segmented-${RADII.length}`} role="group" aria-label="Radius">
                  {RADII.map((r) => (
                    <button key={r} aria-pressed={radius === r} onClick={() => setRadius(r)}>
                      {r} m
                    </button>
                  ))}
                </div>
                <div className="group-footer">
                  {kind === 'client'
                    ? 'Trips starting or ending this close are tagged Work. Use 500 m for big sites or malls.'
                    : kind === 'home'
                      ? 'Trip ends here are never suggested as a client.'
                      : 'Trips here are never tagged or suggested as work.'}
                </div>
              </section>
            ) : (
              <div className="group-footer">Work trips claim the road distance between here and the client, wherever you actually set off.</div>
            )}

            {kind === 'client' && existing?.office_km !== null && existing?.office_km !== undefined && !moved ? (
              <div className="notice">
                {existing.office_km.toFixed(1)} km from {office?.label ?? 'the office'} by road. Each trip here claims this, one way.
              </div>
            ) : null}
            {kind === 'client' && !office ? <div className="notice">Set your office too, so trips here can be claimed from it.</div> : null}

            {error ? (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="sticky-save">
              <button className="button button-primary button-block" disabled={!valid || busy} onClick={() => void save()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
            {!isNew ? (
              <button className="button button-danger button-block" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Remove place
              </button>
            ) : null}
          </>
        ) : null}
      </main>
      {confirmDelete ? (
        <ConfirmSheet
          title="Remove this place? Trips already tagged keep their details."
          confirmLabel="Remove place"
          danger
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
      {pastTrips ? (
        <ConfirmSheet
          title={`${pastTrips.n} earlier Private trip${pastTrips.n === 1 ? '' : 's'} started or ended here. Tag ${pastTrips.n === 1 ? 'it' : 'them'} as Work?`}
          confirmLabel={`Tag ${pastTrips.n} as Work`}
          onConfirm={() => void tagPast()}
          onCancel={() => navigate(-1)}
        />
      ) : null}
    </Screen>
  );
}
