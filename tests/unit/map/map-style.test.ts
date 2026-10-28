import { describe, expect, it } from 'vitest';
import { MAP_COLORS, mapStyle } from '@/styles/map-style';

const paint = (style: ReturnType<typeof mapStyle>, id: string, prop: string) =>
  (style.layers.find((l) => l.id === id) as { paint?: Record<string, unknown> } | undefined)?.paint?.[prop];

describe('map style', () => {
  it('uses the spec §9.6 light colours', () => {
    expect(MAP_COLORS.light).toMatchObject({
      land: '#f3efe9',
      water: '#cfe1e6',
      roadMinor: '#ffffff',
      highway: '#e6dccf',
      label: '#6b635d',
      brand: '#d2431f',
      surface: '#ffffff',
      fg: '#1f1b18',
    });
  });

  it('dark colours come from the dark tokens', () => {
    expect(MAP_COLORS.dark).toMatchObject({ brand: '#ff6a43', surface: '#211e1b', fg: '#f3efeb', label: '#a69d95' });
  });

  it.each(['light', 'dark'] as const)('%s style paints land, water and roads from MAP_COLORS', (theme) => {
    const s = mapStyle({ theme, tiles: true });
    const c = MAP_COLORS[theme];
    expect(paint(s, 'background', 'background-color')).toBe(c.land);
    expect(paint(s, 'water', 'fill-color')).toBe(c.water);
    expect(paint(s, 'road-minor', 'line-color')).toBe(c.roadMinor);
    expect(paint(s, 'road-major', 'line-color')).toBe(c.highway);
    expect(paint(s, 'place-label', 'text-color')).toBe(c.label);
  });

  it('reads OpenFreeMap tiles and fonts when tiles are on', () => {
    const s = mapStyle({ theme: 'light', tiles: true });
    expect(s.sources.openmaptiles).toEqual({ type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
    expect(s.glyphs).toBe('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf');
  });

  it('makes no external requests when tiles are off', () => {
    const s = mapStyle({ theme: 'dark', tiles: false });
    expect(s.sources).toEqual({});
    expect(s.glyphs).toBeUndefined();
    expect(s.layers.map((l) => l.id)).toEqual(['background']);
    expect(paint(s, 'background', 'background-color')).toBe(MAP_COLORS.dark.land);
  });
});
