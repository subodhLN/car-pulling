import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import type { LatLng } from '@/modules/geo/cities';
import { countTrips, searchTrips, type SearchQuery } from '@/modules/trips/search';
import { resetDb } from '../../helpers/db';
import { createTrip, createUser, createVehicle } from '../../helpers/factories';

beforeEach(resetDb);

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-11-01T06:00:00Z'); // 11:30 IST on 1 Nov
const DELHI: LatLng = { lat: 28.6139, lng: 77.209 };
const GURUGRAM: LatLng = { lat: 28.4595, lng: 77.0266 }; // ~21 km from Delhi
const JAIPUR: LatLng = { lat: 26.9124, lng: 75.7873 };
const day2 = new Date('2026-11-02T06:00:00Z'); // 11:30 IST 2 Nov

const q = (over: Partial<SearchQuery> = {}): SearchQuery => ({ from: DELHI, to: JAIPUR, date: '2026-11-02', ...over });

describe('searchTrips', () => {
  it('finds a Gurugram→Jaipur trip when searching Delhi→Jaipur within 30 km', async () => {
    const t = await createTrip({ origin: GURUGRAM, originLabel: 'Gurugram', departureAt: day2 });
    const res = await searchTrips(q({ radiusKm: 30 }), now);
    expect(res.items.map((i) => i.id)).toEqual([t.id]);
    expect(res.items[0].pickupKm).toBeGreaterThan(15);
    expect(res.items[0].pickupKm).toBeLessThan(30);
    expect(res.items[0].originLabel).toBe('Gurugram');
    expect(res.hasMore).toBe(false);
  });

  it('excludes it at radius 5 km', async () => {
    await createTrip({ origin: GURUGRAM, departureAt: day2 });
    expect((await searchTrips(q({ radiusKm: 5 }), now)).items).toHaveLength(0);
  });

  it('applies the destination radius too', async () => {
    await createTrip({ dest: { lat: 30.7333, lng: 76.7794 }, departureAt: day2 }); // Chandigarh
    expect((await searchTrips(q(), now)).items).toHaveLength(0);
  });

  it('IST boundary: 00:30 IST 2 Nov appears for 2026-11-02, not 2026-11-01', async () => {
    const t = await createTrip({ departureAt: new Date('2026-11-01T19:00:00Z') }); // 00:30 IST 2 Nov
    const late = await createTrip({ departureAt: new Date('2026-11-02T18:29:00Z') }); // 23:59 IST 2 Nov
    const next = await createTrip({ departureAt: new Date('2026-11-02T18:30:00Z') }); // 00:00 IST 3 Nov
    const nov2 = await searchTrips(q({ date: '2026-11-02' }), now);
    expect(nov2.items.map((i) => i.id).sort()).toEqual([t.id, late.id].sort());
    const nov1 = await searchTrips(q({ date: '2026-11-01' }), now);
    expect(nov1.items).toHaveLength(0);
    const nov3 = await searchTrips(q({ date: '2026-11-03' }), now);
    expect(nov3.items.map((i) => i.id)).toEqual([next.id]);
  });

  it('excludes CANCELLED trips, trips with seatsAvailable 0, and suspended drivers', async () => {
    const ok = await createTrip({ departureAt: day2 });
    await createTrip({ departureAt: day2, status: 'CANCELLED' });
    await createTrip({ departureAt: day2, status: 'COMPLETED' });
    await createTrip({ departureAt: day2, seatsAvailable: 0 });
    const bad = await createUser({ status: 'SUSPENDED' });
    await createTrip({ departureAt: day2, driverId: bad.id, vehicleId: (await createVehicle(bad.id)).id });
    const res = await searchTrips(q(), now);
    expect(res.items.map((i) => i.id)).toEqual([ok.id]);
    expect(await countTrips(q(), now)).toBe(1);
  });

  it('filters by seats requested', async () => {
    await createTrip({ departureAt: day2, seatsTotal: 3, seatsAvailable: 1 });
    const three = await createTrip({ departureAt: day2, seatsTotal: 3, seatsAvailable: 3 });
    expect((await searchTrips(q({ seats: 2 }), now)).items.map((i) => i.id)).toEqual([three.id]);
  });

  it('excludes trips departing within 1 hour of now', async () => {
    const soon = new Date(now.getTime() + 30 * 60_000);
    await createTrip({ departureAt: soon });
    const edge = new Date(now.getTime() + HOUR); // exactly 1 h: not strictly after
    await createTrip({ departureAt: edge });
    const fine = await createTrip({ departureAt: new Date(now.getTime() + HOUR + 60_000) });
    const res = await searchTrips(q({ date: '2026-11-01' }), now);
    expect(res.items.map((i) => i.id)).toEqual([fine.id]);
  });

  it('returns driver, vehicle, duration and price fields', async () => {
    const driver = await createUser({ name: 'Asha Rao' });
    const vehicle = await createVehicle(driver.id, { make: 'Tata', model: 'Nexon', color: 'Red' });
    const t = await createTrip({ departureAt: day2, driverId: driver.id, vehicleId: vehicle.id, pricePerSeat: 42000 });
    const [item] = (await searchTrips(q(), now)).items;
    expect(item).toMatchObject({
      id: t.id,
      durationMin: null,
      pricePerSeat: 42000,
      seatsAvailable: 3,
      driver: { id: driver.id, name: 'Asha Rao', ratingCount: 0 },
      vehicle: { make: 'Tata', model: 'Nexon', color: 'Red' },
    });
    expect(item.departureAt).toEqual(day2);
    expect(typeof item.driver.ratingAvg).toBe('number');
    expect(item.pickupKm).toBeCloseTo(0, 0);
  });

  it('sort=price orders by pricePerSeat asc', async () => {
    const a = await createTrip({ departureAt: new Date('2026-11-02T04:00:00Z'), pricePerSeat: 60000 });
    const b = await createTrip({ departureAt: new Date('2026-11-02T05:00:00Z'), pricePerSeat: 40000 });
    const c = await createTrip({ departureAt: new Date('2026-11-02T03:00:00Z'), pricePerSeat: 50000 });
    const res = await searchTrips(q({ sort: 'price' }), now);
    expect(res.items.map((i) => i.id)).toEqual([b.id, c.id, a.id]);
    const dep = await searchTrips(q({ sort: 'departure' }), now);
    expect(dep.items.map((i) => i.id)).toEqual([c.id, a.id, b.id]);
  });

  it('sort=pickup orders by distance from the start point', async () => {
    const far = await createTrip({ origin: GURUGRAM, departureAt: new Date('2026-11-02T03:00:00Z') });
    const near = await createTrip({ departureAt: new Date('2026-11-02T08:00:00Z') });
    const res = await searchTrips(q({ sort: 'pickup', radiusKm: 30 }), now);
    expect(res.items.map((i) => i.id)).toEqual([near.id, far.id]);
  });

  it('paginates 20 per page with hasMore', async () => {
    for (let i = 0; i < 21; i++) {
      await createTrip({ departureAt: new Date(day2.getTime() + i * 60_000) });
    }
    const p1 = await searchTrips(q(), now);
    expect(p1.items).toHaveLength(20);
    expect(p1.hasMore).toBe(true);
    expect(p1.page).toBe(1);
    const p2 = await searchTrips(q({ page: 2 }), now);
    expect(p2.items).toHaveLength(1);
    expect(p2.hasMore).toBe(false);
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(21);
    expect(await countTrips(q(), now)).toBe(21);
  });

  it('keeps pagination deterministic when sort keys tie', async () => {
    for (let i = 0; i < 25; i++) await createTrip({ departureAt: day2, pricePerSeat: 40000 });
    for (const sort of ['departure', 'price', 'pickup'] as const) {
      const p1 = await searchTrips(q({ sort }), now);
      const p2 = await searchTrips(q({ sort, page: 2 }), now);
      expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(25);
    }
  });

  it.each([
    ['seats 0', { seats: 0 }],
    ['seats 5', { seats: 5 }],
    ['radius 4', { radiusKm: 4 }],
    ['radius 51', { radiusKm: 51 }],
    ['page 0', { page: 0 }],
    ['bad sort', { sort: 'cheapest' as never }],
    ['bad date format', { date: '02-11-2026' }],
    ['impossible date', { date: '2026-02-30' }],
    ['non-integer seats', { seats: 1.5 }],
    ['bad latitude', { from: { lat: 120, lng: 77 } }],
  ])('throws VALIDATION for %s', async (_n, over) => {
    await expect(searchTrips(q(over as Partial<SearchQuery>), now)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(searchTrips(q(over as Partial<SearchQuery>), now)).rejects.toBeInstanceOf(AppError);
  });
});
