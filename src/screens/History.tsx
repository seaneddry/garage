import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { listCosts } from '../api';
import { useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { monthLabel, rm, shortDate } from '../lib/format';
import { KIND_ICON } from '../lib/kinds';
import { km } from '../lib/reminders';
import type { Cost, EntryKind } from '../types';

type Filter = 'all' | 'needs' | EntryKind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs', label: 'Needs details' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'service', label: 'Service' },
  { id: 'care', label: 'Car care' },
  { id: 'renewal', label: 'Renewals' },
  { id: 'other', label: 'Other' },
];

export function History() {
  const { vehicle } = useVehicle();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as Filter) ?? 'all';
  const [search, setSearch] = useState('');
  const costs = useQuery(() => (vehicle ? listCosts(vehicle.id) : Promise.resolve([] as Cost[])), [vehicle?.id]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (costs.data ?? []).filter((c) => {
      if (filter === 'needs' && !c.needs_details) return false;
      if (filter !== 'all' && filter !== 'needs' && c.kind !== filter) return false;
      if (!q) return true;
      return [c.title, c.place, c.notes, c.expense_description].some((t) => t?.toLowerCase().includes(q));
    });
  }, [costs.data, filter, search]);

  const months = useMemo(() => {
    const map = new Map<string, Cost[]>();
    for (const c of shown) {
      const key = `${c.occurred_on.slice(0, 7)}-01`;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, [shown]);

  const needs = (costs.data ?? []).filter((c) => c.needs_details).length;

  return (
    <Screen title="History">
      <div className="search-bar">
        <label className="search-field">
          <Icon name="search" size={17} />
          <span className="sr-only">Search history</span>
          <input
            type="search"
            placeholder="Search parts, workshops, notes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="pill-row" role="group" aria-label="Filter">
        {FILTERS.filter((f) => f.id !== 'needs' || needs > 0 || filter === 'needs').map((f) => (
          <button
            key={f.id}
            className={`pill ${filter === f.id ? 'pill-on' : ''}`}
            onClick={() => setParams(f.id === 'all' ? {} : { filter: f.id }, { replace: true })}
          >
            {f.label}
            {f.id === 'needs' && needs > 0 ? ` · ${needs}` : ''}
          </button>
        ))}
      </div>

      <main className="page stack">
        {costs.error ? <ErrorNotice message={costs.error} onRetry={costs.reload} /> : null}
        {!costs.data && !costs.error ? <Loading /> : null}
        {costs.data && shown.length === 0 ? (
          <Empty
            icon="history"
            title={filter === 'needs' ? 'All caught up' : 'Nothing here yet'}
            text={
              filter === 'needs'
                ? 'Every recent fuel and service expense has its car details.'
                : 'Fuel, services and other car costs show up here, including the ones you log in the Expense Tracker.'
            }
          />
        ) : null}

        {months.map(([month, rows]) => {
          const total = rows.reduce((t, c) => t + (c.amount ?? 0), 0);
          return (
            <section className="group" key={month}>
              <div className="group-header group-header-split">
                <span>{monthLabel(month)}</span>
                <span className="num">{rm(total)}</span>
              </div>
              <div className="group-body">
                {rows.map((c) => (
                  <CostRow key={c.entry_id ?? c.transaction_id} c={c} />
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </Screen>
  );
}

export function CostRow({ c }: { c: Cost }) {
  const to = c.entry_id ? `/entry/${c.entry_id}` : `/link/${c.transaction_id}`;
  const sub = [
    shortDate(c.occurred_on),
    c.place,
    c.odometer_km !== null ? `${km(c.odometer_km)} km` : null,
    c.litres !== null ? `${c.litres.toFixed(1)} L` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link to={to} className="tx-row">
      <span className={`kind-icon kind-${c.kind}`} aria-hidden="true">
        <Icon name={KIND_ICON[c.kind]} size={18} />
      </span>
      <span className="tx-main">
        <span className="tx-title">{c.title}</span>
        <span className="tx-sub">
          {sub}
          {c.needs_details ? <span className="badge badge-warn">Needs details</span> : null}
        </span>
      </span>
      {c.cost_removed ? (
        <span className="tx-amount tx-removed">Expense deleted</span>
      ) : (
        <span className="tx-amount num">{rm(c.amount)}</span>
      )}
    </Link>
  );
}
