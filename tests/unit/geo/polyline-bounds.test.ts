import { describe, expect, it } from 'vitest';
import { decode6, encode6, toLineString } from '@/lib/polyline';
import { inIndia, placeSchema } from '@/modules/geo/bounds';

describe('polyline6', () => {
  const pts = [
    { lat: 28.613939, lng: 77.209021 },
    { lat: 26.912434, lng: 75.78727 },
  ];

  it('round-trips at precision 6', () => {
    decode6(encode6(pts)).forEach((p, i) => {
      expect(p.lat).toBeCloseTo(pts[i].lat, 6);
      expect(p.lng).toBeCloseTo(pts[i].lng, 6);
    });
  });

  it('is not precision 5 (decoding as 5 would scale coordinates 10x)', () => {
    expect(encode6(pts)).not.toBe('');
    expect(decode6(encode6(pts))[0].lat).toBeLessThan(90);
  });

  it('toLineString emits [lng, lat] pairs', () => {
    expect(toLineString(encode6(pts))).toEqual({
      type: 'LineString',
      coordinates: [
        [77.209021, 28.613939],
        [75.78727, 26.912434],
      ],
    });
  });
});

describe('India bounds', () => {
  it.each([
    [{ lat: 28.6, lng: 77.2 }, true],
    [{ lat: 8.08, lng: 77.55 }, true], // Kanyakumari
    [{ lat: 51.5, lng: -0.1 }, false],
    [{ lat: 6.4, lng: 80 }, false],
    [{ lat: 30, lng: 98 }, false],
  ])('inIndia(%j) = %s', (p, expected) => expect(inIndia(p)).toBe(expected));

  it('placeSchema trims labels and rejects places outside India', () => {
    expect(placeSchema.parse({ label: '  Agra ', lat: 27.18, lng: 78.0 })).toEqual({ label: 'Agra', lat: 27.18, lng: 78.0 });
    const r = placeSchema.safeParse({ label: 'London', lat: 51.5, lng: -0.1 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('Choose a place in India');
  });

  it('placeSchema rejects empty and over-long labels', () => {
    expect(placeSchema.safeParse({ label: '  ', lat: 27, lng: 78 }).success).toBe(false);
    expect(placeSchema.safeParse({ label: 'x'.repeat(121), lat: 27, lng: 78 }).success).toBe(false);
  });
});
