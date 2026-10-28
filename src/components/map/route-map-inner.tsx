'use client';

import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mapStyle, type MapTheme } from '@/styles/map-style';
import { drawRoute, routeData, FIT_PADDING, type MapLike } from './route-layers';
import { useResolvedTheme } from './use-theme';
import type { RouteMapProps } from './route-map';

const tilesOn = () => process.env.NEXT_PUBLIC_MAP_TILES !== 'off';
const media = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;

type State = 'pending' | 'drawn' | 'straight';

export function RouteMapInner({ origin, dest, polyline }: Omit<RouteMapProps, 'className'>) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const shownTheme = useRef<MapTheme | null>(null);
  const cancelDraw = useRef<() => void>(() => {});
  const latest = useRef<{ bounds: [[number, number], [number, number]] } | null>(null);
  // MapLibre's isStyleLoaded() is false whenever tiles or sources are still loading, and `style.load`
  // fires only once per style, so track readiness ourselves.
  const styleReady = useRef(false);
  const theme = useResolvedTheme();
  const [state, setState] = useState<State>('pending');
  const data = useMemo(
    () => routeData(origin, dest, polyline),
    [origin.lat, origin.lng, dest.lat, dest.lng, polyline], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Create the map once; theme and route changes are applied by the effect below.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      style: mapStyle({ theme, tiles: tilesOn() }),
      bounds: data.bounds,
      fitBoundsOptions: { padding: FIT_PADDING },
      attributionControl: false,
      cooperativeGestures: media('(pointer: coarse)'),
      dragRotate: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // Credits come from the tile source (OpenFreeMap / OpenMapTiles / OpenStreetMap).
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    // The frame can settle to its final size after the first fit; refit so the whole route stays in view.
    m.on('resize', () => {
      if (latest.current) m.fitBounds(latest.current.bounds, { padding: FIT_PADDING, animate: false });
    });
    m.on('style.load', () => {
      styleReady.current = true;
    });
    map.current = m;
    shownTheme.current = theme;
    return () => {
      cancelDraw.current();
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    latest.current = data;
    const draw = () => {
      cancelDraw.current();
      cancelDraw.current = drawRoute(m as unknown as MapLike, data, theme, !media('(prefers-reduced-motion: reduce)'));
      setState(data.straight ? 'straight' : 'drawn');
    };
    if (shownTheme.current !== theme) {
      shownTheme.current = theme;
      cancelDraw.current(); // the animation must not touch the outgoing style
      styleReady.current = false;
      m.setStyle(mapStyle({ theme, tiles: tilesOn() }), { diff: false });
      m.once('style.load', draw);
    } else if (styleReady.current) {
      draw();
    } else {
      m.once('style.load', draw);
    }
  }, [data, theme]);

  return <div ref={el} data-testid="route-map" data-route-state={state} className="h-full w-full" />;
}
