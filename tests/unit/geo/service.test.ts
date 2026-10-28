import { describe, expect, it } from 'vitest';
import { CITIES as CITIES, searchCityList } from '@/modules/geo/cities';
import { haversineKm } from '@/modules/geo/service';

describe('geo: haversine and M1 city list', () => {
  it('haversineKm Delhi→Jaipur ≈ 236 km', () =>
    expect(haversineKm({ lat: 28.6139, lng: 77.209 }, { lat: 26.9124, lng: 75.7873 })).toBeCloseTo(236, -1));

  it('haversineKm of identical points is 0', () =>
    expect(haversineKm({ lat: 1, lng: 2 }, { lat: 1, lng: 2 })).toBe(0));

  it('searchCityList("jai") returns Jaipur first, then substring matches', () => {
    const res = searchCityList('jai');
    expect(res[0].label).toMatch(/^Jaipur/);
    expect(res.map((p) => p.label)).toContain('Sindhi Camp (Jaipur)');
  });

  it('is case-insensitive and trims input', async () => {
    expect((searchCityList('  DEL  '))[0].label).toBe('Delhi');
  });

  it('returns [] for empty or blank queries', async () => {
    expect(searchCityList('')).toEqual([]);
    expect(searchCityList('   ')).toEqual([]);
  });

  it('ranks prefix matches before substring, then alphabetical, max 8', () => {
    const res = searchCityList('d');
    const labels = res.map((p) => p.label);
    expect(labels.length).toBeLessThanOrEqual(8);
    const firstSub = labels.findIndex((l) => !l.toLowerCase().startsWith('d'));
    const lastPrefix = labels.map((l) => l.toLowerCase().startsWith('d')).lastIndexOf(true);
    if (firstSub !== -1) expect(lastPrefix).toBeLessThan(firstSub);
    const prefixed = labels.filter((l) => l.toLowerCase().startsWith('d'));
    expect(prefixed).toEqual([...prefixed].sort((a, b) => a.localeCompare(b)));
  });

  it('returns plain places without slug', async () => {
    expect(Object.keys((searchCityList('agra'))[0]).sort()).toEqual(['label', 'lat', 'lng']);
  });

  it('CITIES has the ten cities and five pickup areas with unique slugs', () => {
    expect(CITIES).toHaveLength(15);
    expect(new Set(CITIES.map((c) => c.slug)).size).toBe(15);
    expect(CITIES.find((c) => c.slug === 'delhi')).toMatchObject({ label: 'Delhi', lat: 28.6139, lng: 77.209 });
  });
});
