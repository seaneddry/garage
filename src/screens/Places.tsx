import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { listSavedPlaces, listTrips, savePlace } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { placeName, suggestPlaces, type Suggestion } from '../lib/places';
import type { Place, Trip } from '../types';

function newPlaceUrl(kind: Place['kind'], s?: { lat: number; lng: number; name?: string }) {
  const q = new URLSearchParams({ kind });
  if (s) {
    q.set('lat', String(s.lat));
    q.set('lng', String(s.lng));
    if (s.name) q.set('name', s.name);
  }
  return `/settings/places/new?${q}`;
}

/** Office, home and clients: where work trips are measured from and tagged by. */
export function Places() {
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const { vehicle } = useVehicle();
  const places = useQuery(listSavedPlaces, []);
  const trips = useQuery(() => (vehicle ? listTrips(vehicle.id) : Promise.resolve([] as Trip[])), [vehicle?.id]);

  const all = places.data ?? [];
  const office = all.find((p) => p.kind === 'office');
  const home = all.find((p) => p.kind === 'home');
  const clients = all.filter((p) => p.kind === 'client');
  const others = all.filter((p) => p.kind === 'other');
  const tripsAt = (id: string) => (trips.data ?? []).filter((t) => t.place_id === id).length;

  const suggestions = useMemo(
    () => (places.data && trips.data ? suggestPlaces(trips.data, places.data) : []),
    [places.data, trips.data],
  );
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    for (const s of suggestions) {
      const key = `${s.lat},${s.lng}`;
      if (names[key]) continue;
      placeName(s)
        .then((n) => setNames((m) => ({ ...m, [key]: n })))
        .catch(() => setNames((m) => ({ ...m, [key]: `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  async function notWork(s: Suggestion, name: string) {
    try {
      await savePlace(null, { kind: 'other', name, lat: s.lat, lng: s.lng, radius_m: 200, address: null, office_km: null });
      bump();
      places.reload();
      toast("Got it, it won't be suggested again");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  const row = (p: Place, sub: string) => (
    <Link to={`/settings/places/${p.id}`} className="row" key={p.id}>
      <span className="row-label">
        {p.name}
        <span className="row-sub">{sub}</span>
      </span>
      <Icon name="chevron-right" size={18} />
    </Link>
  );

  return (
    <Screen
      title="Places"
      compact
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} />
          Back
        </button>
      }
      right={
        <Link to={newPlaceUrl('client')} className="nav-button" aria-label="Add a client">
          <Icon name="plus" size={22} />
        </Link>
      }
    >
      <main className="page stack">
        {places.error ? <ErrorNotice message={places.error} onRetry={places.reload} /> : null}
        {!places.data && !places.error ? <Loading /> : null}

        {places.data ? (
          <>
            <section className="group">
              <div className="group-body">
                <Link to={office ? `/settings/places/${office.id}` : newPlaceUrl('office')} className="row">
                  <span className="row-icon">
                    <Icon name="flag" size={18} />
                  </span>
                  <span className="row-label">
                    {office ? office.name : 'Set your office'}
                    <span className="row-sub">Office · work trips are claimed from here</span>
                  </span>
                  <Icon name="chevron-right" size={18} />
                </Link>
                <Link to={home ? `/settings/places/${home.id}` : newPlaceUrl('home')} className="row">
                  <span className="row-icon">
                    <Icon name="home" size={18} />
                  </span>
                  <span className="row-label">
                    {home ? home.name : 'Set your home'}
                    <span className="row-sub">Home · never suggested as a client</span>
                  </span>
                  <Icon name="chevron-right" size={18} />
                </Link>
              </div>
            </section>

            <section className="group">
              <div className="group-header">Clients</div>
              <div className="group-body">
                {clients.map((c) => {
                  const n = tripsAt(c.id);
                  return row(
                    c,
                    [c.office_km !== null ? `${c.office_km.toFixed(1)} km from office` : office ? 'distance not measured' : null, n ? `${n} trip${n === 1 ? '' : 's'}` : null]
                      .filter(Boolean)
                      .join(' · ') || 'Client',
                  );
                })}
                <Link to={newPlaceUrl('client')} className="row">
                  <span className="row-label row-strong">+ Add a client</span>
                </Link>
              </div>
              <div className="group-footer">
                A trip that starts or ends at a client is tagged Work, with the client and its office distance filled in. You can switch any trip back to
                Private.
              </div>
            </section>

            {suggestions.length > 0 ? (
              <section className="group">
                <div className="group-header">Suggested</div>
                <div className="stack-tight">
                  {suggestions.map((s) => {
                    const name = names[`${s.lat},${s.lng}`];
                    return (
                      <div className="suggest-card" key={`${s.lat},${s.lng}`}>
                        <span>
                          {s.trips} trips ended near <strong>{name ?? 'this spot'}</strong>. Is it a client?
                        </span>
                        <span className="suggest-actions">
                          <Link className="button button-primary button-small" to={newPlaceUrl('client', { ...s, name })}>
                            Save as client
                          </Link>
                          <button className="button button-secondary button-small" disabled={!name} onClick={() => void notWork(s, name!)}>
                            Not work
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {others.length > 0 ? (
              <section className="group">
                <div className="group-header">Not work</div>
                <div className="group-body">{others.map((p) => row(p, 'Never tagged or suggested'))}</div>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </Screen>
  );
}
