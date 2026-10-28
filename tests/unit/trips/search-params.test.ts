import { describe, expect, it } from 'vitest';
import { parseSearchParams } from '@/modules/trips/search-params';

const NOW = new Date('2026-11-01T19:00:00Z'); // 00:30 IST on 2 Nov

describe('parseSearchParams', () => {
  it('resolves city slugs and defaults the date to today in IST', () => {
    const r = parseSearchParams({ from: 'delhi', to: 'jaipur' }, NOW);
    expect(r.fromLabel).toBe('Delhi');
    expect(r.toLabel).toBe('Jaipur');
    expect(r.query).toEqual({
      from: { lat: 28.6139, lng: 77.209 },
      to: { lat: 26.9124, lng: 75.7873 },
      date: '2026-11-02',
      seats: 1,
      radiusKm: 15,
      sort: 'departure',
      page: 1,
    });
  });

  it('accepts lat,lng with label params', () => {
    const r = parseSearchParams({ from: '28.5,77.1', to: 'jaipur', fromLabel: 'Saket', date: '2026-12-05' }, NOW);
    expect(r.query?.from).toEqual({ lat: 28.5, lng: 77.1 });
    expect(r.fromLabel).toBe('Saket');
    expect(r.query?.date).toBe('2026-12-05');
  });

  it('uses a generic label for coordinates without a label param, and ignores labels for slugs', () => {
    const r = parseSearchParams({ from: '28.5,77.1', to: 'jaipur', toLabel: 'Hacked' }, NOW);
    expect(r.fromLabel).toBe('Chosen location');
    expect(r.toLabel).toBe('Jaipur');
  });

  it('truncates absurdly long labels', () => {
    const r = parseSearchParams({ from: '28.5,77.1', to: 'jaipur', fromLabel: 'x'.repeat(500) }, NOW);
    expect(r.fromLabel.length).toBeLessThanOrEqual(80);
  });

  it('returns a null query when from or to is missing or unknown', () => {
    expect(parseSearchParams({}, NOW).query).toBeNull();
    expect(parseSearchParams({ from: 'delhi' }, NOW).query).toBeNull();
    expect(parseSearchParams({ from: 'delhi', to: 'atlantis' }, NOW).query).toBeNull();
    expect(parseSearchParams({ from: '99,200', to: 'jaipur' }, NOW).query).toBeNull();
    expect(parseSearchParams({ from: 'a,b', to: 'jaipur' }, NOW).query).toBeNull();
  });

  it('falls back to defaults for bad optional params', () => {
    const r = parseSearchParams(
      { from: 'delhi', to: 'jaipur', date: '2026-02-30', seats: '9', radius: '70', sort: 'zzz', page: '-3' },
      NOW,
    );
    expect(r.query).toMatchObject({ date: '2026-11-02', seats: 1, radiusKm: 15, sort: 'departure', page: 1 });
  });

  it('accepts valid optional params and takes the first of repeated values', () => {
    const r = parseSearchParams(
      { from: ['delhi', 'agra'], to: 'jaipur', date: '2026-11-09', seats: '3', radius: '25', sort: 'price', page: '2' },
      NOW,
    );
    expect(r.query).toMatchObject({ date: '2026-11-09', seats: 3, radiusKm: 25, sort: 'price', page: 2 });
    expect(r.fromLabel).toBe('Delhi');
  });
});
