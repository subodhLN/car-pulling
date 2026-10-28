import type { GeoProvider, LatLng, RouteInfo } from '../types';
import { USER_AGENT } from './photon';

const BASE = 'https://router.project-osrm.org';
const TIMEOUT_MS = 6000;

type OsrmResponse = { code: string; routes?: { geometry: string; distance: number; duration: number }[] };

export async function osrmRoute(a: LatLng, b: LatLng): Promise<RouteInfo | null> {
  const coords = `${a.lng},${a.lat};${b.lng},${b.lat}`;
  const res = await fetch(`${BASE}/route/v1/driving/${coords}?overview=simplified&geometries=polyline6`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OSRM responded ${res.status}`);
  const body = (await res.json()) as OsrmResponse;
  const r = body.code === 'Ok' ? body.routes?.[0] : undefined;
  if (!r) return null;
  return {
    polyline: r.geometry,
    distanceKm: Math.round(r.distance / 100) / 10,
    durationMin: Math.ceil(r.duration / 60),
  };
}

export const osrmProvider: Pick<GeoProvider, 'route'> = { route: osrmRoute };
