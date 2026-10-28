import polyline from '@mapbox/polyline';
import type { LatLng } from '@/modules/geo/types';

// Routes are stored as polyline6 (OSRM `geometries=polyline6`); decoding at precision 5 would misplace them.
const PRECISION = 6;

export function encode6(points: LatLng[]): string {
  return polyline.encode(
    points.map((p) => [p.lat, p.lng]),
    PRECISION,
  );
}

export function decode6(encoded: string): LatLng[] {
  return polyline.decode(encoded, PRECISION).map(([lat, lng]) => ({ lat, lng }));
}

/** GeoJSON wants [lng, lat]. */
export function toLineString(encoded: string): { type: 'LineString'; coordinates: [number, number][] } {
  return { type: 'LineString', coordinates: decode6(encoded).map((p) => [p.lng, p.lat]) };
}
