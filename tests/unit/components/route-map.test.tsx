import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encode6, toLineString } from '@/lib/polyline';

type Handler = () => void;
class FakeMap {
  static last: FakeMap;
  layers: { id: string; paint?: Record<string, unknown> }[] = [];
  sources: Record<string, { data: unknown }> = {};
  handlers: Record<string, Handler[]> = {};
  setStyle = vi.fn((...args: unknown[]) => {
    void args;
    this.styleLoaded = false;
    this.layers = [];
    this.sources = {};
  });
  fitBounds = vi.fn();
  constructor(public opts: Record<string, unknown>) {
    FakeMap.last = this;
  }
  listeners: Record<string, Handler[]> = {};
  once(ev: string, h: Handler) {
    (this.handlers[ev] ??= []).push(h);
  }
  on(ev: string, h: Handler) {
    (this.listeners[ev] ??= []).push(h);
  }
  fire(ev: string) {
    (this.listeners[ev] ?? []).forEach((h) => h());
  }
  emit(ev: string) {
    if (ev === 'style.load') this.styleLoaded = true;
    (this.listeners[ev] ?? []).forEach((h) => h());
    const hs = this.handlers[ev] ?? [];
    this.handlers[ev] = [];
    hs.forEach((h) => h());
  }
  isStyleLoaded() {
    return false;
  }
  addControl() {}
  addSource(id: string, s: { data: unknown }) {
    this.sources[id] = s;
  }
  getSource(id: string) {
    return this.sources[id] ? { setData: (d: unknown) => (this.sources[id].data = d) } : undefined;
  }
  removeSource(id: string) {
    delete this.sources[id];
  }
  addLayer(l: { id: string; paint?: Record<string, unknown> }) {
    this.layers.push(l);
  }
  getLayer(id: string) {
    return this.layers.find((l) => l.id === id);
  }
  removeLayer(id: string) {
    this.layers = this.layers.filter((l) => l.id !== id);
  }
  styleLoaded = true;
  setPaintProperty = vi.fn(() => {
    if (!this.styleLoaded) throw new Error('Style is not done loading.');
  });
  remove() {}
}

vi.mock('maplibre-gl', () => ({
  default: {
    Map: function (o: Record<string, unknown>) {
      return new FakeMap(o);
    },
    NavigationControl: function () {},
    AttributionControl: function () {},
  },
}));

import { RouteMapInner } from '@/components/map/route-map-inner';

const DELHI = { lat: 28.6139, lng: 77.209, label: 'Delhi' };
const JAIPUR = { lat: 26.9124, lng: 75.7873, label: 'Jaipur' };
const poly = encode6([DELHI, { lat: 27.8, lng: 76.5 }, JAIPUR]);

function setMotion(reduce: boolean) {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes('reduce') ? reduce : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setMotion(true);
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => vi.clearAllMocks());

const container = () => screen.getByTestId('route-map');

describe('RouteMapInner', () => {
  it('draws the stored route once the style loads', () => {
    render(<RouteMapInner origin={DELHI} dest={JAIPUR} polyline={poly} />);
    expect(container()).toHaveAttribute('data-route-state', 'pending');
    act(() => FakeMap.last.emit('style.load'));
    expect(container()).toHaveAttribute('data-route-state', 'drawn');
    const route = FakeMap.last.sources.route.data as { geometry: unknown };
    expect(route.geometry).toEqual(toLineString(poly));
    expect(FakeMap.last.layers.map((l) => l.id)).toEqual(['route-casing', 'route-line', 'pickup', 'dest']);
  });

  it('draws a dashed straight line when there is no stored route', () => {
    render(<RouteMapInner origin={DELHI} dest={JAIPUR} polyline={null} />);
    act(() => FakeMap.last.emit('style.load'));
    expect(container()).toHaveAttribute('data-route-state', 'straight');
    const line = FakeMap.last.getLayer('route-line')!;
    expect(line.paint?.['line-dasharray']).toEqual([2, 2]);
    const route = FakeMap.last.sources.route.data as { geometry: { coordinates: number[][] } };
    expect(route.geometry.coordinates).toEqual([
      [DELHI.lng, DELHI.lat],
      [JAIPUR.lng, JAIPUR.lat],
    ]);
  });

  it('fits the route without animation under reduced motion', () => {
    render(<RouteMapInner origin={DELHI} dest={JAIPUR} polyline={poly} />);
    act(() => FakeMap.last.emit('style.load'));
    expect(FakeMap.last.fitBounds).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ animate: false }));
  });

  it('refits the route when the map is resized, leaving room for the summary card', () => {
    render(<RouteMapInner origin={DELHI} dest={JAIPUR} polyline={poly} />);
    act(() => FakeMap.last.emit('style.load'));
    FakeMap.last.fitBounds.mockClear();
    act(() => FakeMap.last.fire('resize'));
    expect(FakeMap.last.fitBounds).toHaveBeenCalledWith(
      [
        [75.7873, 26.9124],
        [77.209, 28.6139],
      ],
      expect.objectContaining({ padding: { top: 96, right: 48, bottom: 48, left: 48 }, animate: false }),
    );
  });

  it('redraws when the route changes after the first load, even while tiles are still loading', () => {
    const { rerender } = render(<RouteMapInner origin={DELHI} dest={JAIPUR} polyline={poly} />);
    act(() => FakeMap.last.emit('style.load'));
    // FakeMap.isStyleLoaded() is false (as it is in MapLibre while tiles stream in)
    const AGRA = { lat: 27.1767, lng: 78.0081, label: 'Agra' };
    rerender(<RouteMapInner origin={DELHI} dest={AGRA} polyline={null} />);
    const route = FakeMap.last.sources.route.data as { geometry: { coordinates: number[][] } };
    expect(route.geometry.coordinates.at(-1)).toEqual([AGRA.lng, AGRA.lat]);
    expect(container()).toHaveAttribute('data-route-state', 'straight');
  });

  it('stops the draw-in animation before switching style', async () => {
    setMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames[id - 1] = () => {};
    });
    render(<RouteMapInner origin={DELHI} dest={JAIPUR} polyline={poly} />);
    act(() => FakeMap.last.emit('style.load'));
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });
    // A frame scheduled before the switch must not touch the not-yet-loaded new style.
    expect(() => frames.forEach((f) => f(performance.now() + 100))).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('keeps the map credits expanded after load', () => {
    render(<RouteMapInner origin={DELHI} dest={JAIPUR} polyline={poly} />);
    const attrib = document.createElement('div');
    attrib.className = 'maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show';
    container().appendChild(attrib);
    act(() => FakeMap.last.emit('load'));
    expect(attrib).toHaveClass('maplibregl-compact-show');
  });

  it('re-styles on theme change and keeps the route', async () => {
    render(<RouteMapInner origin={DELHI} dest={JAIPUR} polyline={poly} />);
    act(() => FakeMap.last.emit('style.load'));
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });
    expect(FakeMap.last.setStyle).toHaveBeenCalledWith(expect.objectContaining({ name: 'rideshare-dark' }), {
      diff: false,
    });
    expect(FakeMap.last.layers).toEqual([]);
    act(() => FakeMap.last.emit('style.load'));
    expect(FakeMap.last.layers.map((l) => l.id)).toContain('route-line');
    expect(container()).toHaveAttribute('data-route-state', 'drawn');
  });

  it('uses cooperative gestures on touch screens', () => {
    window.matchMedia = vi.fn((q: string) => ({
      matches: q.includes('coarse') || q.includes('reduce'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    render(<RouteMapInner origin={DELHI} dest={JAIPUR} polyline={poly} />);
    expect(FakeMap.last.opts.cooperativeGestures).toBe(true);
  });
});
