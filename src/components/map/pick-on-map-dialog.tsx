'use client';

import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { inIndia } from '@/modules/geo/bounds';
import { reversePlaceAction } from '@/modules/geo/actions';
import type { LatLng, PlaceSuggestion } from '@/modules/geo/types';
import { MAP_COLORS, mapStyle } from '@/styles/map-style';
import { useResolvedTheme } from './use-theme';

const INDIA_CENTER: [number, number] = [78.9, 22.6];
const tilesOn = () => process.env.NEXT_PUBLIC_MAP_TILES !== 'off';

type Props = {
  open: boolean;
  initial?: LatLng | null;
  onPick: (place: PlaceSuggestion) => void;
  onClose: () => void;
};

/**
 * "Choose on map": click to drop a pin, reverse-geocode it, confirm. Loaded client-side only.
 * Callers remount it per opening (React `key`) so every opening starts with no pin.
 */
export function PickOnMapDialog({ open, initial = null, onPick, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const theme = useResolvedTheme();
  const [point, setPoint] = useState<LatLng | null>(null);
  const [place, setPlace] = useState<PlaceSuggestion | null>(null);
  const [status, setStatus] = useState<'idle' | 'looking' | 'outside'>('idle');

  useEffect(() => {
    const d = dialog.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const map = new maplibregl.Map({
      container: mapEl.current!,
      style: mapStyle({ theme, tiles: tilesOn() }),
      center: initial ? [initial.lng, initial.lat] : INDIA_CENTER,
      zoom: initial ? 11 : 4,
      attributionControl: false,
      dragRotate: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    const marker = new maplibregl.Marker({ color: MAP_COLORS[theme].brand });
    map.on('click', async (e) => {
      const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      const mine = ++seq.current;
      if (!inIndia(p)) {
        setPoint(null);
        setPlace(null);
        setStatus('outside');
        return;
      }
      marker.setLngLat([p.lng, p.lat]).addTo(map);
      setPoint(p);
      setPlace(null);
      setStatus('looking');
      let found: PlaceSuggestion | null = null;
      try {
        const res = await reversePlaceAction(p);
        found = res.ok ? res.data.place : null;
      } catch {
        found = null;
      }
      if (mine !== seq.current) return; // a later click superseded this lookup
      setPlace(found);
      setStatus('idle');
    });
    return () => map.remove();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = place?.label ?? (point ? `Dropped pin (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})` : null);

  function confirm() {
    if (!point || !label) return;
    onPick({ label, detail: place?.detail ?? null, lat: point.lat, lng: point.lng });
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="pick-on-map-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(100%-32px,720px)] rounded-card border border-line bg-surface p-0 text-fg shadow-float backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <h2 id="pick-on-map-title" className="text-lg font-bold tracking-tight">
          Choose on map
        </h2>
        <p className="text-sm text-muted">Tap the map to drop a pin</p>
      </div>
      <div className="relative h-[min(60vh,420px)] bg-[var(--map-land)]">
        <div ref={mapEl} className="absolute inset-0" />
      </div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <p className="min-w-0 flex-1 text-[15px]" aria-live="polite">
          {status === 'outside' && <span className="text-muted">Choose a place in India</span>}
          {status === 'looking' && <span className="text-muted">Finding this place…</span>}
          {status === 'idle' && label && <span className="font-semibold">{label}</span>}
          {status === 'idle' && !label && <span className="text-muted">No place chosen yet</span>}
        </p>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={confirm} disabled={!point || status !== 'idle'}>
          Use this place
        </Button>
      </div>
    </dialog>
  );
}
