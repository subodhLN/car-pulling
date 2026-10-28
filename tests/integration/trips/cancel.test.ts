import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { err } from '@/lib/result';
import * as bookings from '@/modules/bookings/service';
import { requestBooking, transition, type Actor } from '@/modules/bookings/service';
import * as payments from '@/modules/payments/service';
import { cancelTrip } from '@/modules/trips/cancel';
import { resetDb } from '../../helpers/db';
import { createTrip, createUser } from '../../helpers/factories';

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

async function book(tripId: string, seats: number): Promise<string> {
  const p = await createUser();
  const res = await requestBooking(p.id, tripId, seats);
  if (!res.ok) throw new Error(`setup booking failed: ${res.code}`);
  return res.data.bookingId;
}

describe('cancelTrip', () => {
  it('cancelTrip cancels requested and accepted bookings, refunds accepted in full, returns seats', async () => {
    const trip = await createTrip({ seatsTotal: 4 });
    const driver: Actor = { userId: trip.driverId, kind: 'DRIVER' };
    const requested = await book(trip.id, 1);
    const accepted = await book(trip.id, 2);
    const rejected = await book(trip.id, 1);
    expect(await transition(accepted, 'ACCEPT', driver)).toMatchObject({ ok: true });
    expect(await transition(rejected, 'REJECT', driver)).toMatchObject({ ok: true });

    const res = await cancelTrip(trip.id, driver);
    expect(res).toEqual({ ok: true, data: { cancelledBookings: 2, failedBookingIds: [] } });

    const t = await db.trip.findUniqueOrThrow({ where: { id: trip.id } });
    expect(t.status).toBe('CANCELLED');
    expect(t.seatsAvailable).toBe(4);

    const acc = await db.booking.findUniqueOrThrow({ where: { id: accepted } });
    expect(acc).toMatchObject({ status: 'CANCELLED', cancelledBy: 'DRIVER', refundAmount: acc.amount });
    const req = await db.booking.findUniqueOrThrow({ where: { id: requested } });
    expect(req).toMatchObject({ status: 'CANCELLED', cancelledBy: 'DRIVER', refundAmount: 0 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: rejected } })).status).toBe('REJECTED');
  });

  it('cancelTrip by non-driver → NOT_ALLOWED', async () => {
    const trip = await createTrip();
    const bookingId = await book(trip.id, 1);
    const other = await createUser();
    expect(await cancelTrip(trip.id, { userId: other.id, kind: 'DRIVER' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect(await cancelTrip(trip.id, { userId: other.id, kind: 'PASSENGER' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe('PUBLISHED');
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('REQUESTED');
  });

  it('missing trip → NOT_FOUND; already cancelled → INVALID_STATE', async () => {
    const trip = await createTrip();
    const driver: Actor = { userId: trip.driverId, kind: 'DRIVER' };
    expect(await cancelTrip('nope', driver)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await cancelTrip(trip.id, driver)).toMatchObject({ ok: true });
    expect(await cancelTrip(trip.id, driver)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('an admin can cancel any trip; accepted passengers get a full refund', async () => {
    const trip = await createTrip();
    const accepted = await book(trip.id, 1);
    await transition(accepted, 'ACCEPT', { userId: trip.driverId, kind: 'DRIVER' });
    const admin = await createUser({ role: 'ADMIN' });
    expect(await cancelTrip(trip.id, { userId: admin.id, kind: 'ADMIN' })).toMatchObject({
      ok: true,
      data: { cancelledBookings: 1 },
    });
    const b = await db.booking.findUniqueOrThrow({ where: { id: accepted } });
    expect(b).toMatchObject({ status: 'CANCELLED', cancelledBy: 'ADMIN', refundAmount: b.amount });
  });

  it('blocks new requests once cancelled', async () => {
    const trip = await createTrip();
    await cancelTrip(trip.id, { userId: trip.driverId, kind: 'DRIVER' });
    const p = await createUser();
    expect(await requestBooking(p.id, trip.id, 1)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('a failed booking transition is reported and does not stop the others', async () => {
    const trip = await createTrip({ seatsTotal: 4 });
    const driver: Actor = { userId: trip.driverId, kind: 'DRIVER' };
    const a = await book(trip.id, 1);
    const b = await book(trip.id, 1);
    await transition(a, 'ACCEPT', driver);
    await transition(b, 'ACCEPT', driver);
    vi.spyOn(payments, 'refund').mockImplementation(async (id: string) =>
      id === a ? err('PAYMENT_FAILED', 'Refund failed') : { ok: true, data: undefined },
    );

    const res = await cancelTrip(trip.id, driver);
    expect(res).toEqual({ ok: true, data: { cancelledBookings: 1, failedBookingIds: [a] } });
    expect((await db.booking.findUniqueOrThrow({ where: { id: a } })).status).toBe('ACCEPTED');
    expect((await db.booking.findUniqueOrThrow({ where: { id: b } })).status).toBe('CANCELLED');
    expect((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe('CANCELLED');
  });

  it('continues after a transition throws, reporting that booking as failed', async () => {
    const trip = await createTrip({ seatsTotal: 4 });
    const driver: Actor = { userId: trip.driverId, kind: 'DRIVER' };
    const ids = [await book(trip.id, 1), await book(trip.id, 1)].sort();
    const real = bookings.transition;
    const spy = vi.spyOn(bookings, 'transition');
    spy.mockImplementationOnce(async () => {
      throw new Error('connection reset');
    });
    spy.mockImplementation(real);

    const res = await cancelTrip(trip.id, driver);
    expect(res).toEqual({ ok: true, data: { cancelledBookings: 1, failedBookingIds: [ids[0]] } });
    expect((await db.booking.findUniqueOrThrow({ where: { id: ids[0] } })).status).toBe('REQUESTED');
    expect((await db.booking.findUniqueOrThrow({ where: { id: ids[1] } })).status).toBe('CANCELLED');
  });

  it('a trip that has already left → INVALID_STATE', async () => {
    const trip = await createTrip({ departureAt: new Date(Date.now() + 3 * 60 * 60 * 1000) });
    const later = new Date(trip.departureAt.getTime() + 60_000);
    expect(await cancelTrip(trip.id, { userId: trip.driverId, kind: 'DRIVER' }, later)).toEqual({
      ok: false,
      code: 'INVALID_STATE',
      message: 'This trip has already left',
    });
    expect((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe('PUBLISHED');
  });
});

