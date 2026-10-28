import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { route } from '@/modules/geo/service';
import { backfillRoutes } from '../../../scripts/backfill-routes';
import { resetDb } from '../../helpers/db';
import { createTrip } from '../../helpers/factories';

beforeEach(resetDb);

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 2 * DAY);

describe('backfillRoutes', () => {
  it('fills routes for upcoming published trips that have none', async () => {
    const t = await createTrip({ departureAt: future() });
    expect(await backfillRoutes({ delayMs: 0 })).toEqual({ updated: 1, failed: 0 });
    const row = await db.trip.findUniqueOrThrow({ where: { id: t.id } });
    const expected = await route({ lat: 28.6139, lng: 77.209 }, { lat: 26.9124, lng: 75.7873 });
    expect(row).toMatchObject({
      routePolyline: expected!.polyline,
      distanceKm: expected!.distanceKm,
      durationMin: expected!.durationMin,
    });
  });

  it('skips past, cancelled and already-routed trips, and is idempotent', async () => {
    await createTrip({ departureAt: new Date(Date.now() - DAY) });
    await createTrip({ departureAt: future(), status: 'CANCELLED' });
    await createTrip({ departureAt: future() });
    expect(await backfillRoutes({ delayMs: 0 })).toEqual({ updated: 1, failed: 0 });
    expect(await backfillRoutes({ delayMs: 0 })).toEqual({ updated: 0, failed: 0 });
  });

  it('respects the limit', async () => {
    await createTrip({ departureAt: future() });
    await createTrip({ departureAt: future() });
    expect(await backfillRoutes({ delayMs: 0, limit: 1 })).toEqual({ updated: 1, failed: 0 });
  });
});
