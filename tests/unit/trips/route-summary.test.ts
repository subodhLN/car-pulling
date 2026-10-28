import { describe, expect, it } from 'vitest';
import { routeSummary } from '@/modules/trips/route-summary';

describe('routeSummary', () => {
  it('names the pickup, duration and road distance', () =>
    expect(routeSummary({ originLabel: 'Delhi', durationMin: 217, distanceKm: 284.9 })).toBe(
      'Pickup at Delhi · 3h 37m by road · 284.9 km',
    ));

  it('omits what is unknown', () => {
    expect(routeSummary({ originLabel: 'Delhi', durationMin: null, distanceKm: 236 })).toBe('Pickup at Delhi · ≈ 236 km');
    expect(routeSummary({ originLabel: 'Delhi', durationMin: 45, distanceKm: null })).toBe('Pickup at Delhi · 45m by road');
  });
});
