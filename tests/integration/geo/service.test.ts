import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { cached } from '@/modules/geo/cache';
import { getProvider } from '@/modules/geo/providers';
import { primeRoute, reversePlace, route, searchPlaces } from '@/modules/geo/service';
import { resetDb } from '../../helpers/db';

const DELHI = { lat: 28.6139, lng: 77.209 };
const JAIPUR = { lat: 26.9124, lng: 75.7873 };

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe('geo cache', () => {
  it('returns the cached value until the TTL passes, then refetches', async () => {
    const fn = vi.fn().mockResolvedValueOnce({ v: 1 }).mockResolvedValueOnce({ v: 2 });
    const t0 = new Date('2026-11-01T00:00:00Z');
    expect(await cached('k', 60_000, fn, t0)).toEqual({ v: 1 });
    expect(await cached('k', 60_000, fn, new Date(t0.getTime() + 59_000))).toEqual({ v: 1 });
    expect(await cached('k', 60_000, fn, new Date(t0.getTime() + 61_000))).toEqual({ v: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not cache null results', async () => {
    const fn = vi.fn().mockResolvedValue(null);
    await cached('n', 60_000, fn);
    await cached('n', 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(await db.geoCache.count()).toBe(0);
  });

  it('does not cache thrown results and rethrows', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(cached('e', 60_000, fn)).rejects.toThrow('down');
    expect(await db.geoCache.count()).toBe(0);
  });
});

describe('geo service (fake provider)', () => {
  it('uses the fake provider in tests', () => expect(process.env.GEO_PROVIDER).toBe('fake'));

  it('searchPlaces returns suggestions and caches them', async () => {
    const spy = vi.spyOn(getProvider(), 'search');
    const first = await searchPlaces('jai');
    expect(first[0]).toMatchObject({ label: 'Jaipur', detail: 'Fake' });
    await searchPlaces('  JAI ');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('searchPlaces needs at least 2 characters', async () => {
    expect(await searchPlaces('j')).toEqual([]);
    expect(await searchPlaces('   ')).toEqual([]);
  });

  it('searchPlaces falls back to the city list when the provider throws', async () => {
    vi.spyOn(getProvider(), 'search').mockRejectedValueOnce(new Error('down'));
    const r = await searchPlaces('jai');
    expect(r.map((p) => p.label)).toContain('Jaipur');
    expect(r[0].detail).toBeNull();
  });

  it('drops places outside India, dedupes same labels within 25 km, caps at 8', async () => {
    const p = (label: string, lat: number, lng: number) => ({ label, lat, lng, detail: null });
    vi.spyOn(getProvider(), 'search').mockResolvedValueOnce([
      p('Jaipur, West Bengal', 23.4732, 86.1364),
      p('jaipur, west bengal', 23.417, 86.1443), // ~6 km away: duplicate
      p('London', 51.5, -0.1),
      ...Array.from({ length: 10 }, (_, i) => p(`Place ${i}`, 20 + i, 78)),
    ]);
    const r = await searchPlaces('dup');
    expect(r).toHaveLength(8);
    expect(r.filter((x) => x.label.toLowerCase() === 'jaipur, west bengal')).toHaveLength(1);
    expect(r.find((x) => x.label === 'London')).toBeUndefined();
  });

  it('reversePlace returns null outside India without calling the provider', async () => {
    const spy = vi.spyOn(getProvider(), 'reverse');
    expect(await reversePlace({ lat: 51.5, lng: -0.1 })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('reversePlace returns null when the provider throws', async () => {
    vi.spyOn(getProvider(), 'reverse').mockRejectedValueOnce(new Error('down'));
    expect(await reversePlace(JAIPUR)).toBeNull();
  });

  it('route caches successes and returns null (not throw) on provider failure', async () => {
    const spy = vi.spyOn(getProvider(), 'route');
    const a = await route(DELHI, JAIPUR);
    const b = await route(DELHI, JAIPUR);
    expect(a).toEqual(b);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRejectedValueOnce(new Error('down'));
    expect(await route(JAIPUR, DELHI)).toBeNull();
  });

  it('primeRoute stores a known route so route() needs no provider call', async () => {
    const known = { polyline: '_p~iF~ps|U', distanceKm: 284.9, durationMin: 217 };
    await primeRoute(DELHI, JAIPUR, known);
    const spy = vi.spyOn(getProvider(), 'route');
    expect(await route(DELHI, JAIPUR)).toEqual(known);
    expect(spy).not.toHaveBeenCalled();
  });
});
