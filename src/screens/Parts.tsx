import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { listCosts, listPartLines } from '../api';
import { useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { longDate, rm } from '../lib/format';
import { km } from '../lib/reminders';
import type { Cost, PartLine } from '../types';

interface Group {
  key: string;
  name: string;
  lines: { name: string; amount: number | null; occurred_on: string; place: string | null; odometer_km: number | null; to: string }[];
}

/** "Engine Oil 5W-30  4L" and "engine oil 5w-30 4l" are the same part. */
function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** What each part and job cost every time, so a quote can be compared with last time. */
export function Parts() {
  const navigate = useNavigate();
  const { vehicle } = useVehicle();
  const vid = vehicle?.id ?? '';
  const lines = useQuery(() => (vid ? listPartLines(vid) : Promise.resolve([] as PartLine[])), [vid]);
  const costs = useQuery(() => (vid ? listCosts(vid) : Promise.resolve([] as Cost[])), [vid]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    const add = (name: string, row: Group['lines'][number]) => {
      const key = norm(name);
      if (!key) return;
      const g = map.get(key) ?? { key, name, lines: [] };
      g.lines.push(row);
      map.set(key, g);
    };
    for (const l of lines.data ?? []) {
      add(l.name, { name: l.name, amount: l.amount, occurred_on: l.occurred_on, place: l.place, odometer_km: l.odometer_km, to: `/entry/${l.entry_id}` });
    }
    // Services logged without item lines still count, under their own name.
    const withItems = new Set((lines.data ?? []).map((l) => l.entry_id));
    for (const c of costs.data ?? []) {
      if (c.kind !== 'service' && c.kind !== 'other') continue;
      if (c.entry_id && withItems.has(c.entry_id)) continue;
      if (c.amount === null) continue;
      add(c.title, {
        name: c.title,
        amount: c.amount,
        occurred_on: c.occurred_on,
        place: c.place,
        odometer_km: c.odometer_km,
        to: c.entry_id ? `/entry/${c.entry_id}` : `/link/${c.transaction_id}`,
      });
    }
    const q = norm(search);
    return [...map.values()]
      .map((g) => ({ ...g, lines: g.lines.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)) }))
      .filter((g) => !q || g.key.includes(q))
      .sort((a, b) => b.lines.length - a.lines.length || b.lines[0].occurred_on.localeCompare(a.lines[0].occurred_on));
  }, [lines.data, costs.data, search]);

  const loading = !lines.data || !costs.data;
  const error = lines.error ?? costs.error;

  return (
    <Screen
      title="Part prices"
      compact
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} />
          Back
        </button>
      }
    >
      <div className="search-bar">
        <label className="search-field">
          <Icon name="search" size={17} />
          <span className="sr-only">Search parts</span>
          <input type="search" placeholder="e.g. oil, battery, tyre" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <main className="page stack">
        {error ? <ErrorNotice message={error} /> : null}
        {loading && !error ? <Loading /> : null}
        {!loading && groups.length === 0 ? (
          <Empty
            icon="wrench"
            title={search ? 'No match' : 'No parts yet'}
            text="Scan a workshop invoice, or add item lines when you log a service, and their prices build up here."
          />
        ) : null}

        {groups.length > 0 ? (
          <div className="group-body">
            {groups.map((g) => {
              const priced = g.lines.filter((l) => l.amount !== null);
              const last = priced[0];
              const prev = priced[1];
              const diff = last && prev && prev.amount ? (last.amount! - prev.amount) / prev.amount : null;
              const isOpen = open === g.key;
              return (
                <div className="part-group" key={g.key}>
                  <button className="tx-row part-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.key)}>
                    <span className="tx-main">
                      <span className="tx-title">{g.name}</span>
                      <span className="tx-sub">
                        {g.lines.length}× · last {longDate(g.lines[0].occurred_on)}
                        {diff !== null && Math.abs(diff) >= 0.01 ? (
                          <span className={diff > 0 ? 'is-bad-text' : 'is-good-text'}>
                            {' '}
                            · {diff > 0 ? '▲' : '▼'} {Math.abs(diff * 100).toFixed(0)}% vs before
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="tx-amount num">{last ? rm(last.amount) : '—'}</span>
                  </button>
                  {isOpen ? (
                    <div className="part-lines">
                      {g.lines.map((l, i) => (
                        <Link to={l.to} className="part-line" key={i}>
                          <span>
                            {longDate(l.occurred_on)}
                            <small>{[l.place, l.odometer_km !== null ? `${km(l.odometer_km)} km` : null].filter(Boolean).join(' · ')}</small>
                          </span>
                          <strong className="num">{l.amount !== null ? rm(l.amount) : '—'}</strong>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </main>
    </Screen>
  );
}
