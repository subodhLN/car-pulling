import { z } from 'zod';
import { TZ } from '@/lib/time';
import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { CITIES, type LatLng } from '@/modules/geo/cities';

export const SORTS = ['departure', 'price', 'pickup'] as const;
export type SearchSort = (typeof SORTS)[number];
export const RADIUS_OPTIONS = [5, 10, 15, 25, 50] as const;

const latLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** YYYY-MM-DD that is a real calendar date (rejects 2026-02-30). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }, 'Not a real calendar date');

export const searchQuerySchema = z.object({
  from: latLng,
  to: latLng,
  date: isoDate,
  seats: z.number().int().min(1).max(4).default(1),
  radiusKm: z.number().int().min(5).max(50).default(15),
  sort: z.enum(SORTS).default('departure'),
  page: z.number().int().min(1).default(1),
});

export type SearchQuery = {
  from: LatLng;
  to: LatLng;
  /** YYYY-MM-DD, IST calendar day */
  date: string;
  seats?: number;
  radiusKm?: number;
  sort?: SearchSort;
  page?: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function resolvePlace(raw: string | undefined, label: string | undefined): { point: LatLng; label: string } | null {
  if (!raw) return null;
  const city = CITIES.find((c) => c.slug === raw);
  if (city) return { point: { lat: city.lat, lng: city.lng }, label: city.label };
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(raw);
  if (!m) return null;
  const parsed = latLng.safeParse({ lat: Number(m[1]), lng: Number(m[2]) });
  if (!parsed.success) return null;
  return { point: parsed.data, label: label?.trim().slice(0, 80) || 'Chosen location' };
}

function intParam(raw: string | undefined, min: number, max: number, fallback: number): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return n >= min && n <= max ? n : fallback;
}

/**
 * Turn raw URL params into a SearchQuery. Never throws: bad optional params fall back to defaults and an
 * unknown/missing from or to yields `query: null` so the page can prompt for them.
 */
export function parseSearchParams(
  params: RawParams,
  now: Date = new Date(),
): { query: SearchQuery | null; fromLabel: string; toLabel: string } {
  const from = resolvePlace(first(params.from), first(params.fromLabel));
  const to = resolvePlace(first(params.to), first(params.toLabel));
  const fromLabel = from?.label ?? '';
  const toLabel = to?.label ?? '';
  if (!from || !to) return { query: null, fromLabel, toLabel };

  const rawDate = first(params.date);
  const date = rawDate && isoDate.safeParse(rawDate).success ? rawDate : format(new TZDate(now, TZ), 'yyyy-MM-dd');
  const rawSort = first(params.sort);
  const sort = SORTS.find((s) => s === rawSort) ?? 'departure';

  return {
    query: {
      from: from.point,
      to: to.point,
      date,
      seats: intParam(first(params.seats), 1, 4, 1),
      radiusKm: intParam(first(params.radius), 5, 50, 15),
      sort,
      page: intParam(first(params.page), 1, 1_000_000, 1),
    },
    fromLabel,
    toLabel,
  };
}
