import { describe, expect, it } from 'vitest';
import { formatIst, istDayRange } from '@/lib/time';

describe('time', () => {
  it('istDayRange covers the IST calendar day', () => {
    const { start, end } = istDayRange('2026-11-02');
    expect(start.toISOString()).toBe('2026-11-01T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-11-02T18:30:00.000Z');
  });
  it('formatIst renders in Asia/Kolkata', () => {
    expect(formatIst(new Date('2026-11-01T19:00:00Z'), 'HH:mm d MMM')).toBe('00:30 2 Nov');
  });
});
