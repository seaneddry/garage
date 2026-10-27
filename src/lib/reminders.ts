import type { Reminder } from '../types';
import { todayKL } from './format';

export interface ReminderStatus {
  /** Date it falls due (by months, or a fixed date). */
  dueOn: string | null;
  daysLeft: number | null;
  /** Odometer reading it falls due at. */
  dueKm: number | null;
  kmLeft: number | null;
  /** 0 to 1, how much of the interval has been used, for the bars. */
  dateUsed: number | null;
  kmUsed: number | null;
  /** Days until the earlier of the two, estimated from average km per day for the km side. */
  soonestDays: number | null;
  state: 'overdue' | 'soon' | 'ok' | 'unset';
}

export function addMonthsToDate(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function reminderStatus(r: Reminder, currentKm: number | null, kmPerDay: number | null): ReminderStatus {
  const today = todayKL();
  let dueOn: string | null = r.due_on;
  if (!dueOn && r.last_done_on && r.every_months) dueOn = addMonthsToDate(r.last_done_on, r.every_months);
  const daysLeft = dueOn ? daysBetween(today, dueOn) : null;

  const dueKm = r.last_done_km !== null && r.every_km ? r.last_done_km + r.every_km : null;
  const kmLeft = dueKm !== null && currentKm !== null ? dueKm - currentKm : null;

  let dateUsed: number | null = null;
  if (dueOn && r.last_done_on && !r.due_on) {
    const span = daysBetween(r.last_done_on, dueOn);
    dateUsed = span > 0 ? Math.min(Math.max(daysBetween(r.last_done_on, today) / span, 0), 1) : 1;
  } else if (dueOn && daysLeft !== null) {
    dateUsed = Math.min(Math.max(1 - daysLeft / 365, 0), 1);
  }
  const kmUsed = kmLeft !== null && r.every_km ? Math.min(Math.max(1 - kmLeft / r.every_km, 0), 1) : null;

  const kmDays = kmLeft !== null && kmPerDay && kmPerDay > 0 ? Math.round(kmLeft / kmPerDay) : null;
  const candidates = [daysLeft, kmDays].filter((n): n is number => n !== null);
  const soonestDays = candidates.length ? Math.min(...candidates) : null;

  let state: ReminderStatus['state'] = 'unset';
  if (daysLeft !== null || kmLeft !== null) {
    const overdue = (daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft < 0);
    const soon =
      (daysLeft !== null && daysLeft <= r.alert_days) ||
      (kmLeft !== null && r.every_km !== null && kmLeft <= Math.max(500, r.every_km * 0.1)) ||
      (soonestDays !== null && soonestDays <= r.alert_days);
    state = overdue ? 'overdue' : soon ? 'soon' : 'ok';
  }
  return { dueOn, daysLeft, dueKm, kmLeft, dateUsed, kmUsed, soonestDays, state };
}

export function daysText(n: number | null): string {
  if (n === null) return '';
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} overdue`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `${n} days left`;
}

export function kmText(n: number | null): string {
  if (n === null) return '';
  if (n < 0) return `${km(-n)} km overdue`;
  return `${km(n)} km left`;
}

export function km(n: number): string {
  return Math.round(n).toLocaleString('en-MY');
}
