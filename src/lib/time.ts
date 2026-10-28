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
