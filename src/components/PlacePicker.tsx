import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { currentFix } from '../lib/geo';
import { placeName, searchPlaces, type Place, type Pt } from '../lib/places';
import { errorMessage } from '../lib/useQuery';

interface Props {
  /** Rank results around this point (the office). */
  near?: Pt | null;
  /** Extra one-tap choices, e.g. the trip's start and end. */
  shortcuts?: { label: string; sub?: string; place: Pt }[];
  placeholder?: string;
  onPick: (p: Place) => void;
}

/** Search box with results, plus "Use my current location". */
export function PlacePicker({ near = null, shortcuts = [], placeholder = 'Search a place or address', onPick }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setResults(null);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      setBusy('search');
      searchPlaces(term, near)
        .then((r) => live && (setResults(r), setError(null)))
        .catch((e) => live && setError(errorMessage(e)))
        .finally(() => live && setBusy(null));
    }, 450);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function pickPoint(key: string, get: () => Promise<Pt>, fallbackLabel: string) {
    setBusy(key);
    setError(null);
    try {
      const p = await get();
      const label = await placeName(p).catch(() => fallbackLabel);
      onPick({ ...p, label, address: '' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="place-picker">
      <label className="search-field">
        <Icon name="search" size={17} />
        <span className="sr-only">Search places</span>
        <input type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>
      <div className="group-body">
        {results === null ? (
          <>
            <button className="row" disabled={busy !== null} onClick={() => void pickPoint('here', currentFix, 'Current location')}>
              <span className="row-icon">
                <Icon name="flag" size={18} />
              </span>
              <span className="row-label">{busy === 'here' ? 'Getting location…' : 'Use my current location'}</span>
            </button>
            {shortcuts.map((s, i) => (
              <button key={i} className="row" disabled={busy !== null} onClick={() => void pickPoint(`s${i}`, async () => s.place, s.label)}>
                <span className="row-icon">
                  <Icon name="car" size={18} />
                </span>
                <span className="row-label">
                  {busy === `s${i}` ? 'Looking up…' : s.label}
                  {s.sub ? <span className="row-sub">{s.sub}</span> : null}
                </span>
              </button>
            ))}
          </>
        ) : results.length === 0 ? (
          <div className="row">
            <span className="row-label row-sub">{busy ? 'Searching…' : 'No places found. Try a building, road or area name.'}</span>
          </div>
        ) : (
          results.map((r, i) => (
            <button key={i} className="row" onClick={() => onPick(r)}>
              <span className="row-label">
                {r.label}
                <span className="row-sub">{r.address}</span>
              </span>
            </button>
          ))
        )}
      </div>
      {busy === 'search' && results === null ? <div className="group-footer">Searching…</div> : null}
      {error ? (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
