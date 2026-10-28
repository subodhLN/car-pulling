import { describe, expect, it } from 'vitest';
import { addDaysIso, formatIst, istDayRange } from '@/lib/time';

describe('time', () => {
  it('istDayRange covers the IST calendar day', () => {
    const { start, end } = istDayRange('2026-11-02');
    expect(start.toISOString()).toBe('2026-11-01T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-11-02T18:30:00.000Z');
  });
  it('formatIst renders in Asia/Kolkata', () => {
    expect(formatIst(new Date('2026-11-01T19:00:00Z'), 'HH:mm d MMM')).toBe('00:30 2 Nov');
  });
  it('addDaysIso moves an IST calendar date by whole days', () => {
    expect(addDaysIso('2026-10-28', 1)).toBe('2026-10-29');
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysIso('2026-11-02', 5)).toBe('2026-11-07');
    expect(addDaysIso('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDaysIso('2026-11-01', 0)).toBe('2026-11-01');
  });
});
