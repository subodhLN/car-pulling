import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { inIndia } from './bounds';
import { cached } from './cache';
import { searchCityList } from './cities';
import { haversineKm } from './distance';
import { getProvider } from './providers';
import type { LatLng, PlaceSuggestion, RouteInfo } from './types';

export { haversineKm };

const MIN_QUERY = 2;
const MAX_RESULTS = 8;
const PROVIDER_LIMIT = 10;
const DEDUPE_KM = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const PLACE_TTL_MS = DAY_MS;
const ROUTE_TTL_MS = 30 * DAY_MS;

const round5 = (n: number) => n.toFixed(5);
const pointKey = (p: LatLng) => `${round5(p.lat)},${round5(p.lng)}`;

/** Keeps places inside India and drops a repeated label within DEDUPE_KM of an earlier one. */
function tidy(places: PlaceSuggestion[]): PlaceSuggestion[] {
  const kept: PlaceSuggestion[] = [];
  for (const p of places) {
    if (!inIndia(p)) continue;
    const label = p.label.toLowerCase();
    if (kept.some((k) => k.label.toLowerCase() === label && haversineKm(k, p) < DEDUPE_KM)) continue;
    kept.push(p);
    if (kept.length === MAX_RESULTS) break;
  }
  return kept;
}

export async function searchPlaces(q: string): Promise<PlaceSuggestion[]> {
  const query = q.trim().toLowerCase();
  if (query.length < MIN_QUERY) return [];
  try {
    const found = await cached(`place:${query}`, PLACE_TTL_MS, () => getProvider().search(query, PROVIDER_LIMIT));
    return tidy(found ?? []);
  } catch (e) {
    logger.warn({ err: e, query }, 'place search failed; using the city list');
    return searchCityList(query).map((p) => ({ ...p, detail: null }));
  }
}

export async function reversePlace(p: LatLng): Promise<PlaceSuggestion | null> {
  if (!inIndia(p)) return null;
  try {
    return await cached(`rev:${pointKey(p)}`, PLACE_TTL_MS, () => getProvider().reverse(p));
  } catch (e) {
    logger.warn({ err: e }, 'reverse geocoding failed');
    return null;
  }
}

export async function route(a: LatLng, b: LatLng): Promise<RouteInfo | null> {
  try {
    return await cached(`route:${pointKey(a)};${pointKey(b)}`, ROUTE_TTL_MS, () => getProvider().route(a, b));
  } catch (e) {
    logger.warn({ err: e }, 'routing failed; trip will show a straight line');
    return null;
  }
}

/** Spec §10.2: geo autocomplete 30/min per user (per IP when signed out). Reverse shares the bucket. */
export const GEO_RATE_LIMIT = { limit: 30, windowSec: 60 } as const;

export function geoRateKey(who: { userId: string | null; ip: string }): string {
  return who.userId ? `geo:${who.userId}` : `geo:ip:${who.ip}`;
}

const allowed = (key: string) => rateLimit(key, GEO_RATE_LIMIT.limit, GEO_RATE_LIMIT.windowSec);

/** Over the limit, users still get matches from the built-in city list instead of an error. */
export async function limitedPlaceSearch(
  q: string,
  key: string,
): Promise<{ places: PlaceSuggestion[]; limited: boolean }> {
  if (q.trim().length < MIN_QUERY) return { places: [], limited: false };
  if (!(await allowed(key))) {
    return { places: searchCityList(q).map((p) => ({ ...p, detail: null })), limited: true };
  }
  return { places: await searchPlaces(q), limited: false };
}

export async function limitedReverse(
  p: LatLng,
  key: string,
): Promise<{ place: PlaceSuggestion | null; limited: boolean }> {
  if (!(await allowed(key))) return { place: null, limited: true };
  return { place: await reversePlace(p), limited: false };
}
