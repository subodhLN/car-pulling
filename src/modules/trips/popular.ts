import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { formatIst } from '@/lib/time';
import { ROUTE_CITIES } from '@/modules/geo/cities';

export type PopularRoute = {
  originSlug: string;
  originLabel: string;
  destLabel: string;
  /** Slug of the matched destination city (photo key); null only if the city list lacks it. */
  destSlug: string | null;
  rides: number;
  /** Lowest price per seat on the route, integer paise. */
  minPrice: number;
  avgDurationMin: number | null;
  /** IST calendar day (YYYY-MM-DD) of the route's next departure, for the /search link. */
  nextDate: string;
};

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Same lead time search uses, so a card never promises rides search hides. */
const MIN_LEAD_MS = 60 * 60 * 1000;
/** Cities match within this radius; card links search with the same radius so counts agree. */
export const MATCH_RADIUS_KM = 25;
const MATCH_METERS = MATCH_RADIUS_KM * 1000;

type Row = {
  o: string;
  d: string;
  rides: number;
  minPrice: number;
  avgDuration: unknown;
  nextDeparture: Date;
};

/**
 * Most-travelled routes over the next 7 days. Each trip's origin and destination snap to the nearest of
 * the ten route cities within 25 km; trips that match no city (or the same city at both ends) are
 * skipped. Counts only trips search would show: published, seats left, active driver, ≥1 h away.
 */
export async function popularRoutes(limit = 4, now: Date = new Date()): Promise<PopularRoute[]> {
  const from = new Date(now.getTime() + MIN_LEAD_MS);
  const to = new Date(now.getTime() + WINDOW_MS);
  const cities = Prisma.join(
    ROUTE_CITIES.map((c) => Prisma.sql`(${c.slug}, ${c.lng}::float8, ${c.lat}::float8)`),
  );
  const nearest = (col: Prisma.Sql) => Prisma.sql`(
    SELECT c."slug" FROM cities c
    WHERE ST_DWithin(${col}, c."pt", ${MATCH_METERS})
    ORDER BY ST_Distance(${col}, c."pt") ASC
    LIMIT 1)`;

  const rows = await db.$queryRaw<Row[]>`
    WITH cities AS (
      SELECT v."slug", ST_SetSRID(ST_MakePoint(v."lng", v."lat"), 4326)::geography AS "pt"
      FROM (VALUES ${cities}) AS v("slug", "lng", "lat")
    ),
    matched AS (
      SELECT t."pricePerSeat", t."durationMin", t."departureAt",
        ${nearest(Prisma.sql`t."originPoint"`)} AS "o",
        ${nearest(Prisma.sql`t."destPoint"`)} AS "d"
      FROM "Trip" t
      JOIN "User" u ON u."id" = t."driverId"
      WHERE t."status" = 'PUBLISHED'::"TripStatus"
        AND u."status" = 'ACTIVE'::"UserStatus"
        AND t."seatsAvailable" > 0
        AND t."departureAt" > ${from} AND t."departureAt" <= ${to}
    )
    SELECT "o", "d", COUNT(*)::int AS "rides", MIN("pricePerSeat")::int AS "minPrice",
      AVG("durationMin") AS "avgDuration", MIN("departureAt") AS "nextDeparture"
    FROM matched
    WHERE "o" IS NOT NULL AND "d" IS NOT NULL AND "o" <> "d"
    GROUP BY "o", "d"
    ORDER BY "rides" DESC, "minPrice" ASC, "o" ASC, "d" ASC
    LIMIT ${limit}`;

  const label = (slug: string) => ROUTE_CITIES.find((c) => c.slug === slug)?.label ?? slug;
  return rows.map((r) => ({
    originSlug: r.o,
    originLabel: label(r.o),
    destLabel: label(r.d),
    destSlug: ROUTE_CITIES.some((c) => c.slug === r.d) ? r.d : null,
    rides: r.rides,
    minPrice: r.minPrice,
    avgDurationMin: r.avgDuration === null ? null : Math.round(Number(r.avgDuration)),
    nextDate: formatIst(r.nextDeparture, 'yyyy-MM-dd'),
  }));
}
