import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from '@/modules/geo/providers';
import { GEO_RATE_LIMIT, geoRateKey, limitedPlaceSearch, limitedReverse } from '@/modules/geo/service';
import { resetDb } from '../../helpers/db';

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe('rate-limited place search', () => {
  it('keys signed-in users by id and signed-out visitors by IP', () => {
    expect(geoRateKey({ userId: 'u1', ip: '1.2.3.4' })).toBe('geo:u1');
    expect(geoRateKey({ userId: null, ip: '1.2.3.4' })).toBe('geo:ip:1.2.3.4');
  });

  it('allows 30 searches a minute, then serves the city list with limited: true', async () => {
    expect(GEO_RATE_LIMIT).toEqual({ limit: 30, windowSec: 60 });
    const spy = vi.spyOn(getProvider(), 'search');
    for (let i = 0; i < 30; i++) {
      const r = await limitedPlaceSearch(`ja${i}`, 'geo:u1');
      expect(r.limited).toBe(false);
    }
    const calls = spy.mock.calls.length;
    const over = await limitedPlaceSearch('jai', 'geo:u1');
    expect(over.limited).toBe(true);
    expect(over.places.map((p) => p.label)).toContain('Jaipur');
    expect(spy.mock.calls.length).toBe(calls); // no provider call once limited
  });

  it('limits each key separately', async () => {
    for (let i = 0; i < 30; i++) await limitedPlaceSearch(`ag${i}`, 'geo:a');
    expect((await limitedPlaceSearch('agra', 'geo:b')).limited).toBe(false);
  });

  it('reverse shares the bucket and returns null when limited', async () => {
    for (let i = 0; i < 30; i++) await limitedPlaceSearch(`de${i}`, 'geo:r');
    expect(await limitedReverse({ lat: 26.92, lng: 75.79 }, 'geo:r')).toEqual({ place: null, limited: true });
    expect((await limitedReverse({ lat: 26.92, lng: 75.79 }, 'geo:other')).place?.label).toMatch(/Jaipur/);
  });
});
