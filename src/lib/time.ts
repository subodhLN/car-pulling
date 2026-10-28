import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

export const TZ = 'Asia/Kolkata';

/** Half-open [start, end) UTC instants covering the IST calendar day `date` (YYYY-MM-DD). */
export function istDayRange(date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new TZDate(y, m - 1, d, TZ);
  const end = new TZDate(y, m - 1, d + 1, TZ);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

export function formatIst(d: Date, pattern: string): string {
  return format(new TZDate(d, TZ), pattern);
}

/**
 * The calendar date `n` days after `date` (YYYY-MM-DD; n may be negative). Pure calendar arithmetic on the
 * date string, so it is the same in every time zone (IST has no DST, so an IST day is always a calendar day).
 */
export function addDaysIso(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
