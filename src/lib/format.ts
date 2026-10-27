const numberFmt = new Intl.NumberFormat('en-MY', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** RM1,234.50 or -RM1,234.50 */
export function rm(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const body = numberFmt.format(Math.abs(n));
  return `${n < 0 ? '-' : ''}RM${body}`;
}

/** RM1,235 (no decimals), for compact tiles */
export function rmShort(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const body = Math.round(Math.abs(n)).toLocaleString('en-MY');
  return `${n < 0 ? '-' : ''}RM${body}`;
}

export function pct(value: number | null | undefined, digits = 0): string {
  return `${(Number(value ?? 0) * 100).toFixed(digits)}%`;
}

/** Today's date in Malaysia, as YYYY-MM-DD. */
export function todayKL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

/** First day of the month containing the given YYYY-MM-DD date. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(monthStartDate: string, delta: number): string {
  const [y, m] = monthStartDate.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

export function monthLabel(monthStartDate: string): string {
  const [y, m] = monthStartDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function dayLabel(date: string): string {
  const today = todayKL();
  if (date === today) return 'Today';
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (date === y.toISOString().slice(0, 10)) return 'Yesterday';
  const [yy, mm, dd] = date.split('-').map(Number);
  return new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Parse what a person types into an amount field. Returns null if it is not a positive-or-zero number. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/rm/gi, '').replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** "Fri 16 Oct" */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "16 Oct 2026" */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function inDays(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

export const CYCLE_LABEL = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' } as const;
export const CYCLE_UNIT = { weekly: 'a week', monthly: 'a month', quarterly: 'a quarter', yearly: 'a year' } as const;
/** Amount text for a recurring item. Card and PayLater items have no amount. */
export function itemAmount(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Due' : rm(value);
}

export const KIND_LABEL = {
  subscription: 'Subscription',
  bill: 'Bill',
  renewal: 'Renewal',
  credit: 'Card / PayLater',
} as const;
