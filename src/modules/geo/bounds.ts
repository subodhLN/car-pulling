import { z } from 'zod';
import type { LatLng } from './types';

/** Mainland India plus islands; used for Photon's bbox, result filtering and place validation. */
export const INDIA_BBOX = { minLng: 68.1, minLat: 6.5, maxLng: 97.4, maxLat: 35.7 } as const;

export function inIndia(p: LatLng): boolean {
  return (
    p.lat >= INDIA_BBOX.minLat && p.lat <= INDIA_BBOX.maxLat && p.lng >= INDIA_BBOX.minLng && p.lng <= INDIA_BBOX.maxLng
  );
}

export const placeSchema = z
  .object({
    label: z.string().trim().min(1, 'Choose a place').max(120, 'Place name is too long'),
    lat: z.number().finite(),
    lng: z.number().finite(),
  })
  .refine(inIndia, { message: 'Choose a place in India' });
