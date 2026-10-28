'use client';

import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { RouteMap, type MapPoint } from '@/components/map/route-map';
import { Button } from '@/components/ui/button';
import type { TripSummary } from '@/modules/trips/search';
import { routeSummary } from '@/modules/trips/route-summary';
import { TripRow } from './trip-row';

const WIDE = '(min-width: 960px)';

function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

type Props = {
  items: TripSummary[];
  /** The searched places, drawn as a straight line when there are no results. */
  searched: { from: MapPoint; to: MapPoint };
  header: ReactNode;
  empty: ReactNode;
  footer: ReactNode;
};

/** Results list plus a map that follows the hovered or keyboard-focused ride (rows stay links to the trip). */
export function SearchResults({ items, searched, header, empty, footer }: Props) {
  const wide = useWide();
  const mapId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const selected = items.find((t) => t.id === selectedId) ?? items[0] ?? null;

  const map = (
    <div data-testid="search-map" data-selected-trip={selected?.id ?? 'none'} className="relative h-full">
      <RouteMap
        className="h-full"
        origin={selected ? { ...selected.origin, label: selected.originLabel } : searched.from}
        dest={selected ? { ...selected.dest, label: selected.destLabel } : searched.to}
        polyline={selected?.routePolyline ?? null}
      />
      {selected ? (
        <p className="pointer-events-none absolute right-4 bottom-4 left-4 max-w-sm rounded-[16px] bg-surface px-4 py-3 text-sm shadow-float">
          {routeSummary({
            originLabel: selected.originLabel,
            durationMin: selected.durationMin,
            distanceKm: null,
          })}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-6 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section aria-labelledby="results-heading" className="min-w-0 space-y-4">
        {header}
        {!wide ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              aria-expanded={showMap}
              aria-controls={mapId}
              onClick={() => setShowMap((v) => !v)}
            >
              {showMap ? 'Hide map' : 'Show map'}
            </Button>
            {showMap ? (
              <div id={mapId} className="h-[260px]">
                {map}
              </div>
            ) : null}
          </div>
        ) : null}
        {items.length === 0 ? (
          empty
        ) : (
          <ul className="grid gap-3">
            {items.map((t) => (
              <li key={t.id} onMouseEnter={() => setSelectedId(t.id)} onFocusCapture={() => setSelectedId(t.id)}>
                <TripRow trip={t} />
              </li>
            ))}
          </ul>
        )}
        {footer}
      </section>
      {wide ? (
        <aside id={mapId} aria-label="Route map" className="sticky top-6 h-[min(70vh,560px)] self-start">
          {map}
        </aside>
      ) : null}
    </div>
  );
}
