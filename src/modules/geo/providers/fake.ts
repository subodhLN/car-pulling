import { encode6 } from '@/lib/polyline';
import { CITIES, searchCityList } from '../cities';
import { haversineKm } from '../distance';
import type { GeoProvider, PlaceSuggestion } from '../types';

const REVERSE_RADIUS_KM = 25;
const ROAD_FACTOR = 1.25;
const AVG_KMH = 50;

/** Deterministic, offline provider for tests, CI and e2e (GEO_PROVIDER=fake). */
export const fakeProvider: GeoProvider = {
  async search(q, limit) {
    return searchCityList(q)
      .slice(0, limit)
      .map((p) => ({ ...p, detail: 'Fake' }));
  },
  async reverse(p) {
    let best: PlaceSuggestion | null = null;
    let bestKm = REVERSE_RADIUS_KM;
    for (const c of CITIES) {
      const km = haversineKm(p, c);
      if (km <= bestKm) {
        bestKm = km;
        best = { label: c.label, lat: c.lat, lng: c.lng, detail: 'Fake' };
      }
    }
    return best;
  },
  async route(a, b) {
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    const distanceKm = Math.round(haversineKm(a, b) * ROAD_FACTOR * 10) / 10;
    return { polyline: encode6([a, mid, b]), distanceKm, durationMin: Math.ceil((distanceKm / AVG_KMH) * 60) };
  },
};
