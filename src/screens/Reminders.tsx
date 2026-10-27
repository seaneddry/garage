import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { listExpenseDues, listReadings, listReminders } from '../api';
import { useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { longDate, rm } from '../lib/format';
import { latestReading } from '../lib/stats';
import { daysText, km, kmText, reminderStatus } from '../lib/reminders';
import type { Reading, Reminder } from '../types';

function kmPerDay(readings: Reading[]): number | null {
  if (readings.length < 2) return null;
  const s = [...readings].sort((a, b) => a.read_on.localeCompare(b.read_on));
  const days = (Date.parse(s[s.length - 1].read_on) - Date.parse(s[0].read_on)) / 86400000;
  const dist = s[s.length - 1].km - s[0].km;
  return days > 0 && dist > 0 ? dist / days : null;
}

export function Reminders() {
  const { vehicle } = useVehicle();
  const vid = vehicle?.id ?? '';
  const reminders = useQuery(() => (vid ? listReminders(vid) : Promise.resolve([] as Reminder[])), [vid]);
  const readings = useQuery(() => (vid ? listReadings(vid) : Promise.resolve([] as Reading[])), [vid]);
  const dues = useQuery(listExpenseDues, []);

  const current = latestReading(readings.data ?? [])?.km ?? null;
  const pace = kmPerDay(readings.data ?? []);
  const rows = (reminders.data ?? [])
    .map((r) => ({ r, s: reminderStatus(r, current, pace) }))
    .sort((a, b) => Number(b.r.active) - Number(a.r.active) || (a.s.soonestDays ?? 99999) - (b.s.soonestDays ?? 99999));

  return (
    <Screen
      title="Reminders"
      right={
        <Link to="/reminders/new" className="nav-button" aria-label="New reminder">
          <Icon name="plus" size={22} />
        </Link>
      }
    >
      <main className="page stack">
        {reminders.error ? <ErrorNotice message={reminders.error} onRetry={reminders.reload} /> : null}
        {!reminders.data && !reminders.error ? <Loading /> : null}
        {reminders.data && rows.length === 0 ? (
          <Empty
            icon="bell"
            title="No reminders yet"
            text="Add jobs like engine oil, brake fluid or tyre rotation, by months, by km, or both."
            action={
              <Link to="/reminders/new" className="button button-primary">
                Add reminder
              </Link>
            }
          />
        ) : null}

        {rows.length > 0 ? (
          <section className="group">
            <div className="group-header">Maintenance</div>
            <div className="group-body">
              {rows.map(({ r, s }) => {
                const used = Math.max(s.kmUsed ?? 0, s.dateUsed ?? 0);
                const lines = [s.kmLeft !== null ? kmText(s.kmLeft) : null, s.dueOn ? `${daysText(s.daysLeft)} · ${longDate(s.dueOn)}` : null].filter(Boolean);
                return (
                  <Link to={`/reminders/${r.id}`} className={`reminder-row ${r.active ? '' : 'is-off'}`} key={r.id}>
                    <div className="reminder-top">
                      <span className="tx-title">
                        {r.name}
                        {r.is_primary ? <span className="badge">On Garage</span> : null}
                      </span>
                      {s.state === 'overdue' ? <span className="badge badge-danger">Overdue</span> : null}
                      {s.state === 'soon' ? <span className="badge badge-warn">Due soon</span> : null}
                      {!r.active ? <span className="badge">Off</span> : null}
                    </div>
                    {s.state !== 'unset' ? (
                      <div className="bar" aria-hidden="true">
                        <span className={s.state === 'overdue' ? 'is-over' : s.state === 'soon' ? 'is-warn' : ''} style={{ width: `${used * 100}%` }} />
                      </div>
                    ) : null}
                    <div className="tx-sub">
                      {s.state === 'unset' ? 'Set how often to start tracking' : lines.join(' · ')}
                    </div>
                    <div className="tx-sub">
                      {[r.every_months ? `Every ${r.every_months} mo` : null, r.every_km ? `${km(r.every_km)} km` : null, r.last_done_on ? `last ${longDate(r.last_done_on)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {(dues.data ?? []).length > 0 ? (
          <section className="group">
            <div className="group-header">Bills & renewals from Expenses</div>
            <div className="group-body">
              {dues.data!.map((d) => (
                <div className="tx-row" key={d.id}>
                  <span className="tx-main">
                    <span className="tx-title">{d.name}</span>
                    <span className="tx-sub">
                      {d.next_due ? longDate(d.next_due) : ''}
                      {d.amount !== null ? ` · ${rm(d.amount)}` : ''}
                    </span>
                  </span>
                  <span className="due-days">{d.days_until === null ? '' : d.days_until <= 0 ? 'Today' : `${d.days_until} days`}</span>
                </div>
              ))}
            </div>
            <div className="group-footer">These come from Subscriptions in the Expense Tracker (category Vehicle). Edit them there.</div>
          </section>
        ) : null}
      </main>
    </Screen>
  );
}
