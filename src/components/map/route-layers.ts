import { toLineString } from '@/lib/polyline';
import { MAP_COLORS, type MapTheme } from '@/styles/map-style';
import type { LatLng } from '@/modules/geo/types';

/** The slice of maplibre-gl's Map that drawing needs (keeps this testable without WebGL). */
export type MapLike = {
  addSource(id: string, source: object): void;
  getSource(id: string): unknown;
  removeSource(id: string): void;
  addLayer(layer: object): void;
  getLayer(id: string): unknown;
  removeLayer(id: string): void;
  setPaintProperty(layer: string, prop: string, value: unknown): void;
  fitBounds(bounds: [[number, number], [number, number]], opts: object): void;
};

export type RouteData = {
  line: { type: 'LineString'; coordinates: [number, number][] };
  straight: boolean;
  origin: LatLng;
  dest: LatLng;
  bounds: [[number, number], [number, number]];
};

const LAYERS = ['route-casing', 'route-line', 'pickup', 'dest'] as const;
const SOURCES = ['route', 'pins'] as const;
const DRAW_MS = 1600;
// Extra room at the top for the summary card that overlays the map.
export const FIT_PADDING = { top: 96, right: 48, bottom: 48, left: 48 };

export function routeData(origin: LatLng, dest: LatLng, polyline: string | null): RouteData {
  const line = polyline
    ? toLineString(polyline)
    : {
        type: 'LineString' as const,
        coordinates: [
          [origin.lng, origin.lat],
          [dest.lng, dest.lat],
        ] as [number, number][],
      };
  const lngs = line.coordinates.map((c) => c[0]);
  const lats = line.coordinates.map((c) => c[1]);
  return {
    line,
    straight: !polyline,
    origin,
    dest,
    bounds: [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
  };
}

const revealed = (color: string, progress: number) =>
  progress >= 1 ? color : ['step', ['line-progress'], color, progress, 'rgba(0,0,0,0)'];

/** Replaces our route and pin layers; returns a cancel function for the draw-in animation. */
export function drawRoute(map: MapLike, d: RouteData, theme: MapTheme, animate: boolean): () => void {
  const c = MAP_COLORS[theme];
  for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of SOURCES) if (map.getSource(id)) map.removeSource(id);

  map.addSource('route', { type: 'geojson', lineMetrics: true, data: { type: 'Feature', properties: {}, geometry: d.line } });
  map.addSource('pins', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { kind: 'pickup' }, geometry: { type: 'Point', coordinates: [d.origin.lng, d.origin.lat] } },
        { type: 'Feature', properties: { kind: 'dest' }, geometry: { type: 'Point', coordinates: [d.dest.lng, d.dest.lat] } },
      ],
    },
  });
  const lineLayout = { 'line-cap': 'round', 'line-join': 'round' };
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: lineLayout, paint: { 'line-color': c.surface, 'line-width': 9 } });
  const animated = animate && !d.straight;
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: lineLayout,
    paint: d.straight
      ? { 'line-color': c.brand, 'line-width': 5, 'line-dasharray': [2, 2] }
      : { 'line-width': 5, 'line-gradient': revealed(c.brand, animated ? 0 : 1) },
  });
  map.addLayer({
    id: 'pickup',
    type: 'circle',
    source: 'pins',
    filter: ['==', ['get', 'kind'], 'pickup'],
    paint: { 'circle-radius': 7, 'circle-color': c.surface, 'circle-stroke-color': c.fg, 'circle-stroke-width': 3 },
  });
  map.addLayer({
    id: 'dest',
    type: 'circle',
    source: 'pins',
    filter: ['==', ['get', 'kind'], 'dest'],
    paint: { 'circle-radius': 8, 'circle-color': c.brand, 'circle-stroke-color': c.surface, 'circle-stroke-width': 3 },
  });
  map.fitBounds(d.bounds, { padding: FIT_PADDING, animate });

  if (!animated) return () => {};
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / DRAW_MS);
    const eased = 1 - (1 - p) ** 3;
    map.setPaintProperty('route-line', 'line-gradient', revealed(c.brand, eased));
    if (p < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
