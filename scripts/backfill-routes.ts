/**
 * Stores driving routes for upcoming published trips that have none (e.g. trips published before M2,
 * or while OSRM was down). Run once after deploying M2: `npm run routes:backfill`.
 */
import { db } from '@/lib/db';
import { route } from '@/modules/geo/service';

type Row = { id: string; oLat: number; oLng: number; dLat: number; dLng: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function backfillRoutes({ limit = 500, delayMs = 1000 }: { limit?: number; delayMs?: number } = {}) {
  const rows = await db.$queryRaw<Row[]>`
    SELECT id,
      ST_Y("originPoint"::geometry) AS "oLat", ST_X("originPoint"::geometry) AS "oLng",
      ST_Y("destPoint"::geometry) AS "dLat", ST_X("destPoint"::geometry) AS "dLng"
    FROM "Trip"
    WHERE "status" = 'PUBLISHED' AND "routePolyline" IS NULL AND "departureAt" > now()
    ORDER BY "createdAt" ASC, id ASC
    LIMIT ${limit}`;
  let updated = 0;
  let failed = 0;
  for (const [i, t] of rows.entries()) {
    if (i > 0 && delayMs > 0) await sleep(delayMs); // be gentle with the public OSRM server
    const r = await route({ lat: t.oLat, lng: t.oLng }, { lat: t.dLat, lng: t.dLng });
    if (!r) {
      failed++;
      continue;
    }
    await db.trip.update({
      where: { id: t.id },
      data: { routePolyline: r.polyline, distanceKm: r.distanceKm, durationMin: r.durationMin },
    });
    updated++;
  }
  return { updated, failed };
}

if (process.argv[1]?.endsWith('backfill-routes.ts')) {
  backfillRoutes()
    .then((r) => console.log(`Routes backfilled: ${r.updated} updated, ${r.failed} failed.`))
    .finally(() => db.$disconnect());
}
