import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import type { LatLng } from '@/modules/geo/cities';
import { popularRoutes } from '@/modules/trips/popular';
import { resetDb } from '../../helpers/db';
import { createTrip, createUser, createVehicle } from '../../helpers/factories';

beforeEach(resetDb);

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-01T06:00:00Z'); // 11:30 IST, 1 Nov
const at = (days: number) => new Date(now.getTime() + days * DAY);

const DELHI: LatLng = { lat: 28.6139, lng: 77.209 };
const DHAULA_KUAN: LatLng = { lat: 28.5922, lng: 77.1613 }; // a Delhi pickup area, ~5 km from the centre
const GURUGRAM: LatLng = { lat: 28.4595, lng: 77.0266 }; // ~21 km from Delhi, but nearest to Gurugram
const JAIPUR: LatLng = { lat: 26.9124, lng: 75.7873 };
const AGRA: LatLng = { lat: 27.1767, lng: 78.0081 };
const MUMBAI: LatLng = { lat: 19.076, lng: 72.8777 }; // no city within 25 km

describe('popularRoutes', () => {
  it('groups by matched (origin city, destination city): Gurugram→Jaipur and Delhi→Jaipur stay separate', async () => {
    await createTrip({ origin: DELHI, dest: JAIPUR, departureAt: at(2), pricePerSeat: 45000 });
    await createTrip({ origin: DHAULA_KUAN, originLabel: 'Dhaula Kuan (Delhi)', dest: JAIPUR, departureAt: at(1), pricePerSeat: 42000 });
    await createTrip({ origin: GURUGRAM, originLabel: 'Gurugram', dest: JAIPUR, departureAt: at(3), pricePerSeat: 39000 });

    const routes = await popularRoutes(4, now);

    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({
      originSlug: 'delhi',
      originLabel: 'Delhi',
      destSlug: 'jaipur',
      destLabel: 'Jaipur',
      rides: 2,
      minPrice: 42000,
    });
    expect(routes[1]).toMatchObject({ originLabel: 'Gurugram', destLabel: 'Jaipur', rides: 1, minPrice: 39000 });
  });

  it('only counts PUBLISHED trips departing within the next 7 days', async () => {
    await createTrip({ departureAt: at(6.9) });
    await createTrip({ departureAt: at(7.5) }); // beyond the window
    await createTrip({ departureAt: at(-1) }); // in the past
    await createTrip({ departureAt: at(2), status: 'CANCELLED' });
    await createTrip({ departureAt: at(2), status: 'COMPLETED' });

    const routes = await popularRoutes(4, now);
    expect(routes).toHaveLength(1);
    expect(routes[0].rides).toBe(1);
  });

  it('skips full trips and trips by suspended drivers (they would not show up in search)', async () => {
    await createTrip({ departureAt: at(2), seatsAvailable: 0 });
    const bad = await createUser({ status: 'SUSPENDED' });
    await createTrip({ departureAt: at(2), driverId: bad.id, vehicleId: (await createVehicle(bad.id)).id });
    expect(await popularRoutes(4, now)).toEqual([]);
  });

  it('skips trips whose origin or destination is not within 25 km of a city', async () => {
    await createTrip({ origin: MUMBAI, originLabel: 'Mumbai', departureAt: at(2) });
    await createTrip({ dest: MUMBAI, destLabel: 'Mumbai', departureAt: at(2) });
    expect(await popularRoutes(4, now)).toEqual([]);
  });

  it('orders by rides desc, honours the limit, and reports avg duration and next IST departure date', async () => {
    const a1 = await createTrip({ dest: AGRA, destLabel: 'Agra', departureAt: new Date('2026-11-03T19:00:00Z') }); // 00:30 IST 4 Nov
    await db.trip.update({ where: { id: a1.id }, data: { durationMin: 200 } });
    const a2 = await createTrip({ dest: AGRA, destLabel: 'Agra', departureAt: at(5) });
    await db.trip.update({ where: { id: a2.id }, data: { durationMin: 240 } });
    await createTrip({ dest: AGRA, destLabel: 'Agra', departureAt: at(6) }); // no duration: ignored in the average
    await createTrip({ origin: GURUGRAM, dest: JAIPUR, departureAt: at(2) });
    await createTrip({ origin: JAIPUR, dest: DELHI, departureAt: at(2) });

    const routes = await popularRoutes(2, now);

    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({ originLabel: 'Delhi', destSlug: 'agra', rides: 3, avgDurationMin: 220, nextDate: '2026-11-04' });
    expect(routes[1].rides).toBe(1);
    expect(routes[1].avgDurationMin).toBeNull();
  });

  it('defaults to at most 4 routes', async () => {
    const pairs: [LatLng, LatLng][] = [
      [DELHI, JAIPUR],
      [DELHI, AGRA],
      [GURUGRAM, JAIPUR],
      [JAIPUR, DELHI],
      [AGRA, DELHI],
    ];
    for (const [origin, dest] of pairs) await createTrip({ origin, dest, departureAt: at(2) });
    expect(await popularRoutes(undefined, now)).toHaveLength(4);
  });
});
