import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inIndia } from '@/modules/geo/bounds';
import { fakeProvider } from '@/modules/geo/providers/fake';
import { osrmProvider } from '@/modules/geo/providers/osrm';
import { photonProvider } from '@/modules/geo/providers/photon';
import { decode6 } from '@/lib/polyline';

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/geo/${name}.json`, 'utf8'));
const DELHI = { lat: 28.6139, lng: 77.209 };
const JAIPUR = { lat: 26.9124, lng: 75.7873 };

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe('photon provider', () => {
  it('maps features to readable labels with state detail', async () => {
    mockFetch(fixture('photon-jaipur'));
    const r = await photonProvider.search('jaipur', 10);
    expect(r[0]).toEqual({ label: 'Jaipur, Rajasthan', detail: 'Rajasthan', lat: 26.9154576, lng: 75.8189817 });
    expect(r.every(inIndia)).toBe(true);
  });

  it('strips administrative suffixes from the context part', async () => {
    mockFetch(fixture('photon-reverse'));
    expect(await photonProvider.reverse({ lat: 26.9199, lng: 75.7878 })).toMatchObject({
      label: 'Jaipur Junction, Jaipur',
      detail: 'Rajasthan',
    });
  });

  it('sends the India bbox, English language and a User-Agent', async () => {
    const spy = mockFetch({ features: [] });
    await photonProvider.search('agra', 10);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('bbox=68.1%2C6.5%2C97.4%2C35.7');
    expect(String(url)).toContain('lang=en');
    expect(new Headers((init as RequestInit).headers).get('user-agent')).toMatch(/^RideShare/);
  });

  it('drops features outside India even inside the bbox (e.g. Lahore)', async () => {
    mockFetch({
      features: [
        { geometry: { coordinates: [74.3436, 31.5497] }, properties: { name: 'Lahore', state: 'Punjab', countrycode: 'PK' } },
        { geometry: { coordinates: [75.8573, 30.901] }, properties: { name: 'Ludhiana', state: 'Punjab', countrycode: 'IN' } },
      ],
    });
    expect((await photonProvider.search('la', 10)).map((p) => p.label)).toEqual(['Ludhiana, Punjab']);
    mockFetch({ features: [{ geometry: { coordinates: [85.32, 27.71] }, properties: { name: 'Kathmandu', countrycode: 'NP' } }] });
    expect(await photonProvider.reverse({ lat: 27.71, lng: 85.32 })).toBeNull();
  });

  it('drops features without a name', async () => {
    mockFetch({ features: [{ geometry: { coordinates: [75.8, 26.9] }, properties: { state: 'Rajasthan' } }] });
    expect(await photonProvider.search('x', 10)).toEqual([]);
  });

  it('throws on HTTP errors', async () => {
    mockFetch({}, 503);
    await expect(photonProvider.search('agra', 10)).rejects.toThrow(/503/);
  });

  it('returns null from reverse when nothing is found', async () => {
    mockFetch({ features: [] });
    expect(await photonProvider.reverse(DELHI)).toBeNull();
  });
});

describe('osrm provider', () => {
  it('returns polyline6, km to 1 dp and minutes rounded up', async () => {
    const f = fixture('osrm-delhi-jaipur');
    mockFetch(f);
    expect(await osrmProvider.route(DELHI, JAIPUR)).toEqual({
      polyline: f.routes[0].geometry,
      distanceKm: 284.9,
      durationMin: 217,
    });
  });

  it('requests simplified polyline6 geometry with lng,lat order', async () => {
    const spy = mockFetch(fixture('osrm-delhi-jaipur'));
    await osrmProvider.route(DELHI, JAIPUR);
    expect(String(spy.mock.calls[0][0])).toContain(
      '/route/v1/driving/77.209,28.6139;75.7873,26.9124?overview=simplified&geometries=polyline6',
    );
  });

  it('decoded geometry starts near Delhi and ends near Jaipur (precision 6)', async () => {
    mockFetch(fixture('osrm-delhi-jaipur'));
    const pts = decode6((await osrmProvider.route(DELHI, JAIPUR))!.polyline);
    expect(Math.abs(pts[0].lat - DELHI.lat)).toBeLessThan(0.05);
    expect(Math.abs(pts.at(-1)!.lng - JAIPUR.lng)).toBeLessThan(0.05);
  });

  it('returns null when OSRM finds no route', async () => {
    mockFetch({ code: 'NoRoute', routes: [] });
    expect(await osrmProvider.route(DELHI, JAIPUR)).toBeNull();
  });

  it('throws on HTTP errors', async () => {
    mockFetch({}, 500);
    await expect(osrmProvider.route(DELHI, JAIPUR)).rejects.toThrow(/500/);
  });
});

describe('fake provider', () => {
  it('searches the city list deterministically', async () => {
    expect((await fakeProvider.search('jai', 10))[0]).toEqual({
      label: 'Jaipur',
      detail: 'Fake',
      lat: JAIPUR.lat,
      lng: JAIPUR.lng,
    });
  });

  it('reverse returns the nearest city within 25 km, else null', async () => {
    expect((await fakeProvider.reverse({ lat: 26.95, lng: 75.8 }))?.label).toMatch(/Jaipur/);
    expect(await fakeProvider.reverse({ lat: 20, lng: 85 })).toBeNull();
  });

  it('routes as a straight 3-point line with road-factor distance', async () => {
    const r = (await fakeProvider.route(DELHI, JAIPUR))!;
    const pts = decode6(r.polyline);
    expect(pts).toHaveLength(3);
    expect(pts[0].lat).toBeCloseTo(DELHI.lat, 5);
    expect(r.distanceKm).toBe(294.1);
    expect(r.durationMin).toBe(Math.ceil((r.distanceKm / 50) * 60));
  });
});
