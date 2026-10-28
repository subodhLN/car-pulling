'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/cn';
import type { LatLng } from '@/modules/geo/types';

export type MapPoint = LatLng & { label: string };

export type RouteMapProps = {
  origin: MapPoint;
  dest: MapPoint;
  /** Stored polyline6 route, or null to draw a dashed straight line. */
  polyline: string | null;
  className?: string;
};

// MapLibre needs the browser (WebGL), so it never renders on the server.
const Inner = dynamic(() => import('./route-map-inner').then((m) => m.RouteMapInner), { ssr: false });

/** The sized, token-coloured frame doubles as the loading skeleton. */
export function RouteMap({ className, ...props }: RouteMapProps) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-card border border-line bg-[var(--map-land)]', className)}
      role="img"
      aria-label={`Map of the route from ${props.origin.label} to ${props.dest.label}`}
    >
      <Inner {...props} />
    </div>
  );
}
