import { INDIA_BBOX } from '../bounds';
import type { GeoProvider, LatLng, PlaceSuggestion } from '../types';

const BASE = 'https://photon.komoot.io';
const TIMEOUT_MS = 4000;
export const USER_AGENT = 'RideShare/1.0 (portfolio demo)';

type Feature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; city?: string; county?: string; state?: string };
};

// "Jaipur Municipal Corporation" and "Jaipur Tehsil" should read as "Jaipur".
const ADMIN_SUFFIX = /\s+(municipal corporation|municipal council|tehsil|mandal|district|taluka|division)$/i;
const clean = (s: string) => s.replace(ADMIN_SUFFIX, '').trim();

function toSuggestion(f: Feature): PlaceSuggestion | null {
  const p = f.properties ?? {};
  const coords = f.geometry?.coordinates;
  if (!p.name || !coords) return null;
  const context = [p.city, p.county, p.state]
    .filter((s): s is string => Boolean(s))
    .map(clean)
    .find((s) => s.toLowerCase() !== p.name!.toLowerCase());
  return {
    label: context ? `${p.name}, ${context}` : p.name,
    detail: p.state ?? null,
    lat: coords[1],
    lng: coords[0],
  };
}

async function get(path: string, params: Record<string, string>): Promise<Feature[]> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Photon responded ${res.status}`);
  const body = (await res.json()) as { features?: Feature[] };
  return body.features ?? [];
}

const bbox = [INDIA_BBOX.minLng, INDIA_BBOX.minLat, INDIA_BBOX.maxLng, INDIA_BBOX.maxLat].join(',');

export const photonProvider: GeoProvider = {
  async search(q, limit) {
    const features = await get('/api/', { q, limit: String(limit), lang: 'en', bbox });
    return features.map(toSuggestion).filter((s): s is PlaceSuggestion => s !== null);
  },
  async reverse({ lat, lng }: LatLng) {
    const features = await get('/reverse', { lat: String(lat), lon: String(lng), lang: 'en' });
    return features.map(toSuggestion).find((s) => s !== null) ?? null;
  },
  async route() {
    throw new Error('Photon does not route');
  },
};
