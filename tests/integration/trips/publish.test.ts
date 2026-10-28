import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import type { Place } from '@/modules/geo/cities';
import { getProvider } from '@/modules/geo/providers';
import { route } from '@/modules/geo/service';
import { getTrip, publishTrip } from '@/modules/trips/service';
import { resetDb } from '../../helpers/db';
import { createUser, createVehicle } from '../../helpers/factories';

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-11-01T06:00:00Z');
const delhi: Place = { label: 'Delhi', lat: 28.6139, lng: 77.209 };
const jaipur: Place = { label: 'Jaipur', lat: 26.9124, lng: 75.7873 };

async function setup(seats = 4) {
  const driver = await createUser({ name: 'Asha Rao' });
  const vehicle = await createVehicle(driver.id, { seats });
  const input = {
    origin: delhi,
    dest: jaipur,
    departureAt: new Date(now.getTime() + 3 * HOUR),
    vehicleId: vehicle.id,
    seats: 2,
    pricePerSeat: 45000,
  };
  return { driver, vehicle, input };
}

describe('publishTrip', () => {
  it('rejects departure under 2h away', async () => {
    const { driver, input } = await setup();
    const res = await publishTrip(driver.id, { ...input, departureAt: new Date(now.getTime() + 2 * HOUR - 1000) }, now);
    expect(res).toEqual({ ok: false, code: 'VALIDATION', message: 'Departure must be at least 2 hours from now' });
  });

  it('accepts departure exactly 2h away', async () => {
    const { driver, input } = await setup();
    const res = await publishTrip(driver.id, { ...input, departureAt: new Date(now.getTime() + 2 * HOUR) }, now);
    expect(res.ok).toBe(true);
  });

  it('rejects seats above vehicle seats and below 1', async () => {
    const { driver, input } = await setup(3);
    for (const seats of [4, 0]) {
      const res = await publishTrip(driver.id, { ...input, seats }, now);
      expect(res).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: "Seats must be between 1 and your car's 3 passenger seats",
      });
    }
  });

  it('rejects price 4999 and 500001 paise, accepts the bounds', async () => {
    const { driver, input } = await setup();
    for (const pricePerSeat of [4999, 500001]) {
      const res = await publishTrip(driver.id, { ...input, pricePerSeat }, now);
      expect(res).toEqual({ ok: false, code: 'VALIDATION', message: 'Price per seat must be between ₹50 and ₹5,000' });
    }
    expect((await publishTrip(driver.id, { ...input, pricePerSeat: 5000 }, now)).ok).toBe(true);
    expect((await publishTrip(driver.id, { ...input, pricePerSeat: 500000 }, now)).ok).toBe(true);
  });

  it('rejects identical start and end points', async () => {
    const { driver, input } = await setup();
    const res = await publishTrip(driver.id, { ...input, dest: { ...delhi, label: 'Somewhere' } }, now);
    expect(res).toEqual({ ok: false, code: 'VALIDATION', message: 'Pick different start and end points' });
  });

  it("rejects another user's vehicle", async () => {
    const { input } = await setup();
    const other = await createUser();
    const res = await publishTrip(other.id, input, now);
    expect(res).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await db.trip.count()).toBe(0);
  });

  it('rejects notes over 500 characters', async () => {
    const { driver, input } = await setup();
    const res = await publishTrip(driver.id, { ...input, notes: 'x'.repeat(501) }, now);
    expect(res).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('stores points and getTrip reads them back', async () => {
    const { driver, vehicle, input } = await setup();
    const res = await publishTrip(driver.id, { ...input, notes: ' Quiet ride ' }, now);
    if (!res.ok) throw new Error(res.message);
    const trip = await getTrip(res.data.id);
    expect(trip).not.toBeNull();
    expect(trip!.origin.lat).toBeCloseTo(28.6139, 6);
    expect(trip!.origin.lng).toBeCloseTo(77.209, 6);
    expect(trip!.dest.lat).toBeCloseTo(26.9124, 6);
    expect(trip!.dest.lng).toBeCloseTo(75.7873, 6);
    expect(trip!.origin.label).toBe('Delhi');
    expect(trip!.seatsTotal).toBe(2);
    expect(trip!.seatsAvailable).toBe(2);
    expect(trip!.pricePerSeat).toBe(45000);
    expect(trip!.notes).toBe('Quiet ride');
    // M2: the (fake) provider's route is stored on publish
    const expected = await route(delhi, jaipur);
    expect(trip!.durationMin).toBe(expected!.durationMin);
    expect(trip!.distanceKm).toBe(expected!.distanceKm);
    expect(trip!.routePolyline).toBe(expected!.polyline);
    expect(trip!.driver).toMatchObject({ id: driver.id, name: 'Asha Rao', ratingCount: 0, status: 'ACTIVE' });
    expect(trip!.vehicle).toMatchObject({ id: vehicle.id, make: 'Maruti' });
  });

  it("getTrip exposes the driver's account status (suspended drivers' trips are not bookable)", async () => {
    const { driver, input } = await setup();
    const res = await publishTrip(driver.id, input, now);
    if (!res.ok) throw new Error(res.message);
    await db.user.update({ where: { id: driver.id }, data: { status: 'SUSPENDED' } });
    expect((await getTrip(res.data.id))!.driver.status).toBe('SUSPENDED');
  });

  it('getTrip returns null for an unknown id', async () => {
    expect(await getTrip('nope')).toBeNull();
  });

  it('rejects places outside India', async () => {
    const { driver, input } = await setup();
    const res = await publishTrip(driver.id, { ...input, dest: { label: 'London', lat: 51.5, lng: -0.1 } }, now);
    expect(res).toEqual({ ok: false, code: 'VALIDATION', message: 'Choose a place in India' });
  });

  it('still publishes, without a route, when routing fails', async () => {
    vi.spyOn(getProvider(), 'route').mockRejectedValue(new Error('OSRM down'));
    const { driver, input } = await setup();
    const res = await publishTrip(driver.id, { ...input, dest: { label: 'Agra', lat: 27.1767, lng: 78.0081 } }, now);
    expect(res.ok).toBe(true);
    const row = await db.trip.findUniqueOrThrow({ where: { id: res.ok ? res.data.id : '' } });
    expect(row).toMatchObject({ routePolyline: null, distanceKm: null, durationMin: null });
  });
});
