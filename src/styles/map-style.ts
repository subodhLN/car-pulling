import type { StyleSpecification } from 'maplibre-gl';

// Spec §9.6 (light) and the dark tokens of §9.2. The route colours mirror --brand / --surface / --fg.
export const MAP_COLORS = {
  light: {
    land: '#f3efe9',
    water: '#cfe1e6',
    park: '#e8e8dc',
    roadMinor: '#ffffff',
    highway: '#e6dccf',
    boundary: '#cfc6bc',
    label: '#6b635d',
    labelHalo: '#f3efe9',
    brand: '#d2431f',
    surface: '#ffffff',
    fg: '#1f1b18',
  },
  dark: {
    land: '#1f1c1a',
    water: '#1b2b31',
    park: '#232620',
    roadMinor: '#2b2724',
    highway: '#3a332d',
    boundary: '#3d3631',
    label: '#a69d95',
    labelHalo: '#1f1c1a',
    brand: '#ff6a43',
    surface: '#211e1b',
    fg: '#f3efeb',
  },
} as const;

export type MapTheme = keyof typeof MAP_COLORS;

const SOURCE = 'openmaptiles';
const MAJOR = ['motorway', 'trunk', 'primary'];
const MINOR = ['secondary', 'tertiary', 'minor'];

/** A hand-written OpenMapTiles style so every colour comes from our tokens. `tiles: false` makes no network requests. */
export function mapStyle({ theme, tiles }: { theme: MapTheme; tiles: boolean }): StyleSpecification {
  const c = MAP_COLORS[theme];
  const background = { id: 'background', type: 'background' as const, paint: { 'background-color': c.land } };
  if (!tiles) return { version: 8, name: `rideshare-${theme}`, sources: {}, layers: [background] };

  return {
    version: 8,
    name: `rideshare-${theme}`,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { [SOURCE]: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    layers: [
      background,
      {
        id: 'landuse-park',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'park',
        paint: { 'fill-color': c.park, 'fill-opacity': 0.7 },
      },
      { id: 'water', type: 'fill', source: SOURCE, 'source-layer': 'water', paint: { 'fill-color': c.water } },
      {
        id: 'road-minor',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        minzoom: 8,
        filter: ['in', ['get', 'class'], ['literal', MINOR]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 4] },
      },
      {
        id: 'road-major',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', MAJOR]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.highway, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 8, 2.5, 14, 8] },
      },
      {
        id: 'boundary',
        type: 'line',
        source: SOURCE,
        'source-layer': 'boundary',
        filter: ['<=', ['get', 'admin_level'], 4],
        paint: { 'line-color': c.boundary, 'line-width': 1, 'line-dasharray': [3, 2] },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 10, 14],
        },
        paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.2 },
      },
    ],
  };
}
