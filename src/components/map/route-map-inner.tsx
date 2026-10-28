'use client';

import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mapStyle, type MapTheme } from '@/styles/map-style';
import { drawRoute, routeData, FIT_PADDING, type MapLike } from './route-layers';
import { useResolvedTheme } from './use-theme';
import type { RouteMapProps } from './route-map';

const ATTRIBUTION = '© <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const tilesOn = () => process.env.NEXT_PUBLIC_MAP_TILES !== 'off';
const media = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;

type State = 'pending' | 'drawn' | 'straight';

export function RouteMapInner({ origin, dest, polyline }: Omit<RouteMapProps, 'className'>) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const shownTheme = useRef<MapTheme | null>(null);
  const cancelDraw = useRef<() => void>(() => {});
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
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }), 'bottom-right');
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
    const draw = () => {
      cancelDraw.current();
      cancelDraw.current = drawRoute(m as unknown as MapLike, data, theme, !media('(prefers-reduced-motion: reduce)'));
      setState(data.straight ? 'straight' : 'drawn');
    };
    if (shownTheme.current !== theme) {
      shownTheme.current = theme;
      m.setStyle(mapStyle({ theme, tiles: tilesOn() }), { diff: false });
      m.once('style.load', draw);
    } else if (m.isStyleLoaded()) {
      draw();
    } else {
      m.once('style.load', draw);
    }
  }, [data, theme]);

  return <div ref={el} data-testid="route-map" data-route-state={state} className="absolute inset-0" />;
}
