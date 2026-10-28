export type LatLng = { lat: number; lng: number };

export type Place = { label: string; lat: number; lng: number };

/** A place as offered by search; `detail` is a secondary line such as the state ("Rajasthan"). */
export type PlaceSuggestion = Place & { detail: string | null };

/** A driving route: OSRM simplified geometry as polyline6, km to 1 dp, minutes rounded up. */
export type RouteInfo = { polyline: string; distanceKm: number; durationMin: number };

/** Providers throw on network/HTTP failures; `[]` / `null` mean "nothing found". */
export interface GeoProvider {
  search(q: string, limit: number): Promise<PlaceSuggestion[]>;
  reverse(p: LatLng): Promise<PlaceSuggestion | null>;
  route(a: LatLng, b: LatLng): Promise<RouteInfo | null>;
}
