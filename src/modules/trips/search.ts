import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { istDayRange } from '@/lib/time';
import type { LatLng } from '@/modules/geo/types';
import { searchQuerySchema, type SearchQuery } from './search-params';

export type { SearchQuery } from './search-params';

export type TripSummary = {
  id: string;
  departureAt: Date;
  durationMin: number | null;
  originLabel: string;
  destLabel: string;
  pricePerSeat: number;
  seatsAvailable: number;
  pickupKm: number;
  driver: { id: string; name: string | null; image: string | null; ratingAvg: number; ratingCount: number };
  vehicle: { make: string; model: string; color: string };
  origin: LatLng;
  dest: LatLng;
  /** Stored polyline6 route, or null (the map draws a straight line). */
  routePolyline: string | null;
};

export const PAGE_SIZE = 20;
const MIN_LEAD_MS = 60 * 60 * 1000;

// Whitelisted ORDER BY fragments; `id` is the tiebreaker so OFFSET pagination is deterministic.
const ORDER = {
  departure: Prisma.sql`t."departureAt" ASC, t."id" ASC`,
  price: Prisma.sql`t."pricePerSeat" ASC, t."departureAt" ASC, t."id" ASC`,
  pickup: Prisma.sql`"pickupKm" ASC, t."departureAt" ASC, t."id" ASC`,
} as const;

function parse(q: SearchQuery) {
  const res = searchQuerySchema.safeParse(q);
  if (!res.success) {
    throw new AppError('VALIDATION', res.error.issues[0]?.message ?? 'Invalid search');
  }
  return res.data;
}

function where(q: ReturnType<typeof parse>, now: Date) {
  const { start, end } = istDayRange(q.date);
  const earliest = new Date(now.getTime() + MIN_LEAD_MS);
  const meters = q.radiusKm * 1000;
  return Prisma.sql`
    t."status" = 'PUBLISHED'::"TripStatus"
    AND u."status" = 'ACTIVE'::"UserStatus"
    AND t."seatsAvailable" >= ${q.seats}
    AND t."departureAt" >= ${start} AND t."departureAt" < ${end}
    AND t."departureAt" > ${earliest}
    AND ST_DWithin(t."originPoint", ST_SetSRID(ST_MakePoint(${q.from.lng}, ${q.from.lat}), 4326)::geography, ${meters})
    AND ST_DWithin(t."destPoint", ST_SetSRID(ST_MakePoint(${q.to.lng}, ${q.to.lat}), 4326)::geography, ${meters})`;
}

type Row = {
  id: string;
  departureAt: Date;
  durationMin: number | null;
  originLabel: string;
  destLabel: string;
  pricePerSeat: number;
  seatsAvailable: number;
  pickupKm: number;
  driverId: string;
  driverName: string | null;
  driverImage: string | null;
  ratingAvg: unknown;
  ratingCount: number;
  make: string;
  model: string;
  color: string;
  oLat: number;
  oLng: number;
  dLat: number;
  dLng: number;
  routePolyline: string | null;
};

export async function searchTrips(
  query: SearchQuery,
  now: Date = new Date(),
): Promise<{ items: TripSummary[]; page: number; hasMore: boolean }> {
  const q = parse(query);
  const offset = (q.page - 1) * PAGE_SIZE;
  const rows = await db.$queryRaw<Row[]>`
    SELECT t."id", t."departureAt", t."durationMin", t."originLabel", t."destLabel", t."pricePerSeat",
      t."seatsAvailable",
      ST_Distance(t."originPoint", ST_SetSRID(ST_MakePoint(${q.from.lng}, ${q.from.lat}), 4326)::geography) / 1000.0
        AS "pickupKm",
      u."id" AS "driverId", u."name" AS "driverName", u."image" AS "driverImage",
      u."ratingAvg", u."ratingCount", v."make", v."model", v."color",
      ST_Y(t."originPoint"::geometry) AS "oLat", ST_X(t."originPoint"::geometry) AS "oLng",
      ST_Y(t."destPoint"::geometry) AS "dLat", ST_X(t."destPoint"::geometry) AS "dLng", t."routePolyline"
    FROM "Trip" t
    JOIN "User" u ON u."id" = t."driverId"
    JOIN "Vehicle" v ON v."id" = t."vehicleId"
    WHERE ${where(q, now)}
    ORDER BY ${ORDER[q.sort]}
    LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`;

  const items = rows.slice(0, PAGE_SIZE).map(
    (r): TripSummary => ({
      id: r.id,
      departureAt: r.departureAt,
      durationMin: r.durationMin,
      originLabel: r.originLabel,
      destLabel: r.destLabel,
      pricePerSeat: r.pricePerSeat,
      seatsAvailable: r.seatsAvailable,
      pickupKm: Number(r.pickupKm),
      driver: {
        id: r.driverId,
        name: r.driverName,
        image: r.driverImage,
        ratingAvg: Number(r.ratingAvg),
        ratingCount: r.ratingCount,
      },
      vehicle: { make: r.make, model: r.model, color: r.color },
      origin: { lat: r.oLat, lng: r.oLng },
      dest: { lat: r.dLat, lng: r.dLng },
      routePolyline: r.routePolyline,
    }),
  );
  return { items, page: q.page, hasMore: rows.length > PAGE_SIZE };
}

/** Total matches across all pages (same filters as searchTrips), for the results heading. */
export async function countTrips(query: SearchQuery, now: Date = new Date()): Promise<number> {
  const q = parse(query);
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS "n" FROM "Trip" t JOIN "User" u ON u."id" = t."driverId" WHERE ${where(q, now)}`;
  return Number(row?.n ?? 0);
}
