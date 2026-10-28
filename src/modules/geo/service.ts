import { CITIES, type LatLng, type Place } from './cities';

const MAX_RESULTS = 8;

/** M1: label-prefix matches first, then substring matches, each alphabetical. */
export async function searchPlaces(q: string): Promise<Place[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const prefix: Place[] = [];
  const inside: Place[] = [];
  for (const { label, lat, lng } of CITIES) {
    const at = label.toLowerCase().indexOf(needle);
    if (at === 0) prefix.push({ label, lat, lng });
    else if (at > 0) inside.push({ label, lat, lng });
  }
  const byLabel = (a: Place, b: Place) => a.label.localeCompare(b.label);
  return [...prefix.sort(byLabel), ...inside.sort(byLabel)].slice(0, MAX_RESULTS);
}

/** M1 has no routing engine; M2 implements this with OSRM. */
export async function route(
  from: LatLng,
  to: LatLng,
): Promise<{ polyline: string; distanceKm: number; durationMin: number } | null> {
  void from;
  void to;
  return null;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
