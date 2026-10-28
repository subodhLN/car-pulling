import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { err } from '@/lib/result';
import {
  actorFor,
  findActiveBooking,
  listDriverTrips,
  listPassengerBookings,
  listTripBookings,
  requestBooking,
  transition,
  type Actor,
} from '@/modules/bookings/service';
import * as payments from '@/modules/payments/service';
import { resetDb } from '../../helpers/db';
import { createTrip, createUser } from '../../helpers/factories';

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function seatsLeft(tripId: string): Promise<number> {
  return (await db.trip.findUniqueOrThrow({ where: { id: tripId } })).seatsAvailable;
}

async function booked(seats = 2, tripOver: Parameters<typeof createTrip>[0] = {}) {
  const trip = await createTrip({ seatsTotal: 3, ...tripOver });
  const passenger = await createUser();
  const res = await requestBooking(passenger.id, trip.id, seats);
  if (!res.ok) throw new Error(`setup booking failed: ${res.code}`);
  const driver: Actor = { userId: trip.driverId, kind: 'DRIVER' };
  const pax: Actor = { userId: passenger.id, kind: 'PASSENGER' };
  return { trip, passenger, bookingId: res.data.bookingId, driver, pax };
}

describe('requestBooking', () => {
  it('holds seats on request and returns them on reject', async () => {
    const { trip, bookingId, driver } = await booked(2);
    expect(await seatsLeft(trip.id)).toBe(1);
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b).toMatchObject({ status: 'REQUESTED', seats: 2, amount: 2 * trip.pricePerSeat });
    expect(b.expiresAt).toBeInstanceOf(Date);

    const res = await transition(bookingId, 'REJECT', driver);
    expect(res).toMatchObject({ ok: true, data: { status: 'REJECTED' } });
    expect(await seatsLeft(trip.id)).toBe(3);
  });

  it('returns a null clientSecret in M1 and sets expiresAt = min(now+24h, departure)', async () => {
    const now = new Date();
    const trip = await createTrip({ departureAt: new Date(now.getTime() + 5 * HOUR) });
    const p = await createUser();
    const res = await requestBooking(p.id, trip.id, 1, now);
    expect(res).toMatchObject({ ok: true, data: { clientSecret: null } });
    if (!res.ok) return;
    const b = await db.booking.findUniqueOrThrow({ where: { id: res.data.bookingId } });
    expect(b.expiresAt?.getTime()).toBe(trip.departureAt.getTime());
  });

  it('TRIP_FULL when not enough seats', async () => {
    const trip = await createTrip({ seatsTotal: 3, seatsAvailable: 1 });
    const p = await createUser();
    expect(await requestBooking(p.id, trip.id, 2)).toMatchObject({ ok: false, code: 'TRIP_FULL' });
    expect(await seatsLeft(trip.id)).toBe(1);
    expect(await db.booking.count()).toBe(0);
  });

  it('cannot book own trip', async () => {
    const trip = await createTrip();
    expect(await requestBooking(trip.driverId, trip.id, 1)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await seatsLeft(trip.id)).toBe(3);
  });

  it('missing trip → NOT_FOUND', async () => {
    const p = await createUser();
    expect(await requestBooking(p.id, 'nope', 1)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('seats outside 1–4 → VALIDATION', async () => {
    const trip = await createTrip({ seatsTotal: 6 });
    const p = await createUser();
    for (const n of [0, 5, 1.5]) {
      expect(await requestBooking(p.id, trip.id, n)).toMatchObject({ ok: false, code: 'VALIDATION' });
    }
    expect(await seatsLeft(trip.id)).toBe(6);
  });

  it('non-PUBLISHED trip or departure within 1 h → INVALID_STATE', async () => {
    const now = new Date();
    const p = await createUser();
    const cancelled = await createTrip({ status: 'CANCELLED' });
    expect(await requestBooking(p.id, cancelled.id, 1, now)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    const soon = await createTrip({ departureAt: new Date(now.getTime() + HOUR) });
    expect(await requestBooking(p.id, soon.id, 1, now)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect(await seatsLeft(soon.id)).toBe(3);
  });

  it('second request by the same passenger → INVALID_STATE, seats held once', async () => {
    const { trip, passenger } = await booked(1);
    expect(await requestBooking(passenger.id, trip.id, 1)).toMatchObject({
      ok: false,
      code: 'INVALID_STATE',
      message: 'You already have a booking on this trip',
    });
    expect(await seatsLeft(trip.id)).toBe(2);
  });

  it('can request again after the previous booking was cancelled', async () => {
    const { trip, passenger, bookingId, pax } = await booked(1);
    expect((await transition(bookingId, 'CANCEL', pax)).ok).toBe(true);
    expect((await requestBooking(passenger.id, trip.id, 1)).ok).toBe(true);
    expect(await seatsLeft(trip.id)).toBe(2);
  });

  it('10 concurrent requests for the last seat → exactly 1 succeeds', async () => {
    const trip = await createTrip({ seatsTotal: 1, seatsAvailable: 1 });
    const users = await Promise.all(Array.from({ length: 10 }, () => createUser()));
    const res = await Promise.all(users.map((u) => requestBooking(u.id, trip.id, 1)));
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(res.filter((r) => !r.ok).every((r) => !r.ok && r.code === 'TRIP_FULL')).toBe(true);
    expect((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).seatsAvailable).toBe(0);
    expect(await db.booking.count()).toBe(1);
  });

  it('same passenger requesting twice concurrently → one booking, seats held once', async () => {
    const trip = await createTrip({ seatsTotal: 4 });
    const p = await createUser();
    const res = await Promise.all([requestBooking(p.id, trip.id, 2), requestBooking(p.id, trip.id, 2)]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(res.find((r) => !r.ok)).toMatchObject({ code: 'INVALID_STATE' });
    expect(await db.booking.count({ where: { tripId: trip.id, passengerId: p.id } })).toBe(1);
    expect(await seatsLeft(trip.id)).toBe(2);
  });
});

describe('transition', () => {
  it('driver accepts → ACCEPTED, seats stay held, payment captured', async () => {
    const capture = vi.spyOn(payments, 'capture');
    const { trip, bookingId, driver } = await booked(2);
    expect(await transition(bookingId, 'ACCEPT', driver)).toMatchObject({ ok: true, data: { status: 'ACCEPTED' } });
    expect(capture).toHaveBeenCalledWith(bookingId);
    expect(await seatsLeft(trip.id)).toBe(1);
  });

  it('missing booking → NOT_FOUND', async () => {
    expect(await transition('nope', 'ACCEPT', { userId: null, kind: 'ADMIN' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });

  it('accept after EXPIRE → INVALID_STATE and seats unchanged', async () => {
    const { trip, bookingId, driver } = await booked(2);
    expect(await transition(bookingId, 'EXPIRE', { userId: null, kind: 'SYSTEM' })).toMatchObject({
      ok: true,
      data: { status: 'EXPIRED' },
    });
    expect(await seatsLeft(trip.id)).toBe(3);
    expect(await transition(bookingId, 'ACCEPT', driver)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect(await seatsLeft(trip.id)).toBe(3);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('EXPIRED');
  });

  it('concurrent ACCEPT and EXPIRE → exactly one wins, seats consistent', async () => {
    const { trip, bookingId, driver } = await booked(2);
    const [a, e] = await Promise.all([
      transition(bookingId, 'ACCEPT', driver),
      transition(bookingId, 'EXPIRE', { userId: null, kind: 'SYSTEM' }),
    ]);
    expect([a.ok, e.ok].filter(Boolean)).toHaveLength(1);
    const status = (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status;
    expect(await seatsLeft(trip.id)).toBe(status === 'ACCEPTED' ? 1 : 3);
  });

  it('passenger cannot ACCEPT; other user cannot CANCEL', async () => {
    const { trip, bookingId, pax } = await booked(1);
    const stranger = await createUser();
    expect(await transition(bookingId, 'ACCEPT', pax)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await transition(bookingId, 'CANCEL', { userId: stranger.id, kind: 'PASSENGER' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect(await transition(bookingId, 'CANCEL', { userId: stranger.id, kind: 'DRIVER' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('REQUESTED');
    expect(await seatsLeft(trip.id)).toBe(2);
  });

  it('non-party gets NOT_ALLOWED even for an invalid move (state not revealed)', async () => {
    const { bookingId, driver } = await booked(1);
    await transition(bookingId, 'REJECT', driver);
    const stranger = await createUser();
    expect(await transition(bookingId, 'CANCEL', { userId: stranger.id, kind: 'PASSENGER' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
  });

  it('admin can accept any booking', async () => {
    const { bookingId } = await booked(1);
    const admin = await createUser({ role: 'ADMIN' });
    expect(await transition(bookingId, 'ACCEPT', { userId: admin.id, kind: 'ADMIN' })).toMatchObject({
      ok: true,
      data: { status: 'ACCEPTED' },
    });
  });

  it('passenger cancel of ACCEPTED 2 days out stores refundAmount = amount, cancelledBy PASSENGER', async () => {
    const refund = vi.spyOn(payments, 'refund');
    const { trip, bookingId, driver, pax } = await booked(2, { departureAt: new Date(Date.now() + 2 * DAY) });
    await transition(bookingId, 'ACCEPT', driver);
    const res = await transition(bookingId, 'CANCEL', pax);
    expect(res).toMatchObject({
      ok: true,
      data: { status: 'CANCELLED', refundAmount: 2 * trip.pricePerSeat, cancelledBy: 'PASSENGER' },
    });
    expect(refund).toHaveBeenCalledWith(bookingId, 2 * trip.pricePerSeat);
    expect(await seatsLeft(trip.id)).toBe(3);
  });

  it('passenger cancel of ACCEPTED within 24 h → refundAmount 0, no refund call', async () => {
    const refund = vi.spyOn(payments, 'refund');
    const { trip, bookingId, driver, pax } = await booked(1, { departureAt: new Date(Date.now() + 2 * DAY) });
    await transition(bookingId, 'ACCEPT', driver);
    const late = new Date(trip.departureAt.getTime() - 3 * HOUR);
    expect(await transition(bookingId, 'CANCEL', pax, late)).toMatchObject({
      ok: true,
      data: { status: 'CANCELLED', refundAmount: 0, cancelledBy: 'PASSENGER' },
    });
    expect(refund).not.toHaveBeenCalled();
  });

  it('driver cancel of REQUESTED releases the hold, refund 0, cancelledBy DRIVER', async () => {
    const release = vi.spyOn(payments, 'release');
    const { trip, bookingId, driver } = await booked(2);
    expect(await transition(bookingId, 'CANCEL', driver)).toMatchObject({
      ok: true,
      data: { status: 'CANCELLED', refundAmount: 0, cancelledBy: 'DRIVER' },
    });
    expect(release).toHaveBeenCalledWith(bookingId);
    expect(await seatsLeft(trip.id)).toBe(3);
  });

  it('PAYMENT_FAILED leaves status unchanged', async () => {
    vi.spyOn(payments, 'capture').mockResolvedValue(err('PAYMENT_FAILED', 'x'));
    const { trip, bookingId, driver } = await booked(2);
    expect(await transition(bookingId, 'ACCEPT', driver)).toMatchObject({ ok: false, code: 'PAYMENT_FAILED' });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('REQUESTED');
    expect(await seatsLeft(trip.id)).toBe(1);
  });

  it('PAYMENT_FAILED on release leaves status and seats unchanged', async () => {
    vi.spyOn(payments, 'release').mockResolvedValue(err('PAYMENT_FAILED', 'x'));
    const { trip, bookingId, driver } = await booked(2);
    expect(await transition(bookingId, 'REJECT', driver)).toMatchObject({ ok: false, code: 'PAYMENT_FAILED' });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('REQUESTED');
    expect(await seatsLeft(trip.id)).toBe(1);
  });
});

describe('transition: inline expiry (fix round 1)', () => {
  async function expiring() {
    const ctx = await booked(2);
    const b = await db.booking.findUniqueOrThrow({ where: { id: ctx.bookingId } });
    return { ...ctx, expiresAt: b.expiresAt! };
  }

  it('ACCEPT after expiresAt → INVALID_STATE, booking EXPIRED, seats returned once, hold released', async () => {
    const capture = vi.spyOn(payments, 'capture');
    const release = vi.spyOn(payments, 'release');
    const { trip, bookingId, driver, expiresAt } = await expiring();
    const late = new Date(expiresAt.getTime() + 1);
    expect(await transition(bookingId, 'ACCEPT', driver, late)).toEqual({
      ok: false,
      code: 'INVALID_STATE',
      message: 'This request has expired',
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('EXPIRED');
    expect(await seatsLeft(trip.id)).toBe(3);
    expect(capture).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(bookingId);
    // A second late attempt sees EXPIRED and must not return seats again.
    expect(await transition(bookingId, 'ACCEPT', driver, late)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect(await seatsLeft(trip.id)).toBe(3);
  });

  it('ACCEPT exactly at expiresAt is already too late', async () => {
    const { bookingId, driver, expiresAt } = await expiring();
    expect(await transition(bookingId, 'ACCEPT', driver, expiresAt)).toMatchObject({
      ok: false,
      message: 'This request has expired',
    });
  });

  it('REJECT after expiresAt → INVALID_STATE, booking EXPIRED, seats returned once', async () => {
    const { trip, bookingId, driver, expiresAt } = await expiring();
    expect(await transition(bookingId, 'REJECT', driver, new Date(expiresAt.getTime() + 60_000))).toEqual({
      ok: false,
      code: 'INVALID_STATE',
      message: 'This request has expired',
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('EXPIRED');
    expect(await seatsLeft(trip.id)).toBe(3);
  });

  it('ACCEPT 1 ms before expiresAt still works', async () => {
    const { trip, bookingId, driver, expiresAt } = await expiring();
    expect(await transition(bookingId, 'ACCEPT', driver, new Date(expiresAt.getTime() - 1))).toMatchObject({
      ok: true,
      data: { status: 'ACCEPTED' },
    });
    expect(await seatsLeft(trip.id)).toBe(1);
  });

  it('non-party ACCEPT after expiry → NOT_ALLOWED and nothing changes', async () => {
    const { trip, bookingId, pax, expiresAt } = await expiring();
    expect(await transition(bookingId, 'ACCEPT', pax, new Date(expiresAt.getTime() + 1))).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('REQUESTED');
    expect(await seatsLeft(trip.id)).toBe(1);
  });

  it('passenger CANCEL after expiresAt still cancels (only ACCEPT/REJECT expire inline)', async () => {
    const { bookingId, pax, expiresAt } = await expiring();
    expect(await transition(bookingId, 'CANCEL', pax, new Date(expiresAt.getTime() + 1))).toMatchObject({
      ok: true,
      data: { status: 'CANCELLED' },
    });
  });
});

describe('requestBooking uses the locked trip row (fix round 1)', () => {
  it('rejects own full trip with NOT_ALLOWED, and a full trip within 1 h with INVALID_STATE', async () => {
    const now = new Date();
    const full = await createTrip({ seatsTotal: 1, seatsAvailable: 0 });
    expect(await requestBooking(full.driverId, full.id, 1, now)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    const soonFull = await createTrip({ seatsTotal: 1, seatsAvailable: 0, departureAt: new Date(now.getTime() + HOUR) });
    const p = await createUser();
    expect(await requestBooking(p.id, soonFull.id, 1, now)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('amount uses the price on the locked row', async () => {
    const trip = await createTrip({ pricePerSeat: 12300 });
    const p = await createUser();
    const res = await requestBooking(p.id, trip.id, 3);
    if (!res.ok) throw new Error(res.code);
    expect((await db.booking.findUniqueOrThrow({ where: { id: res.data.bookingId } })).amount).toBe(36900);
  });
});

describe('deadlock / serialization retry (fix round 1)', () => {
  const conflict = () =>
    new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock', {
      code: 'P2034',
      clientVersion: Prisma.prismaVersion.client,
    });

  it('requestBooking retries once, then returns INVALID_STATE "Please try again"', async () => {
    const trip = await createTrip();
    const p = await createUser();
    const spy = vi.spyOn(db, '$transaction').mockRejectedValue(conflict());
    expect(await requestBooking(p.id, trip.id, 1)).toEqual({
      ok: false,
      code: 'INVALID_STATE',
      message: 'Please try again',
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('requestBooking succeeds when the retry succeeds', async () => {
    const trip = await createTrip();
    const p = await createUser();
    const spy = vi.spyOn(db, '$transaction').mockRejectedValueOnce(conflict());
    expect((await requestBooking(p.id, trip.id, 1)).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await seatsLeft(trip.id)).toBe(2);
  });

  it('transition retries once, then returns INVALID_STATE "Please try again"', async () => {
    const { bookingId, driver } = await booked(1);
    const spy = vi.spyOn(db, '$transaction').mockRejectedValue(conflict());
    expect(await transition(bookingId, 'ACCEPT', driver)).toEqual({
      ok: false,
      code: 'INVALID_STATE',
      message: 'Please try again',
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('real deadlock: cancel b1 vs. same passenger re-requesting → no uncaught error, seats consistent', async () => {
    // Reproduce the interleaving deterministically with a hand-driven transaction standing in for cancel:
    // it updates the booking (Booking lock + partial-unique entry being deleted) and, once requestBooking
    // has taken the Trip lock and is blocked on the unique index, updates the Trip → 40P01.
    const { trip, passenger, bookingId } = await booked(1);
    let reqPromise!: ReturnType<typeof requestBooking>;
    const manual = db
      .$transaction(
        async (tx) => {
          await tx.$executeRaw`UPDATE "Booking" SET "status" = 'CANCELLED' WHERE "id" = ${bookingId}`;
          reqPromise = requestBooking(passenger.id, trip.id, 1);
          await new Promise((r) => setTimeout(r, 300));
          await tx.$executeRaw`UPDATE "Trip" SET "seatsAvailable" = "seatsAvailable" + 1 WHERE "id" = ${trip.id}`;
        },
        { timeout: 15_000 },
      )
      .then(
        () => 'committed' as const,
        () => 'aborted' as const,
      );
    const manualOutcome = await manual;
    const res = await reqPromise;
    // Whichever side Postgres picked as the victim, requestBooking returns a Result rather than throwing.
    if (manualOutcome === 'committed') {
      expect(res.ok).toBe(true);
      expect(await seatsLeft(trip.id)).toBe(2);
    } else {
      expect(res).toMatchObject({ ok: false, code: 'INVALID_STATE' });
      expect(await seatsLeft(trip.id)).toBe(2);
    }
  });
});

describe('actorFor', () => {
  it('maps passenger, driver, admin and strangers', async () => {
    const { trip, passenger, bookingId } = await booked(1);
    const admin = await createUser({ role: 'ADMIN' });
    const stranger = await createUser();
    expect(await actorFor(bookingId, { id: passenger.id, role: 'USER' })).toEqual({
      userId: passenger.id,
      kind: 'PASSENGER',
    });
    expect(await actorFor(bookingId, { id: trip.driverId, role: 'USER' })).toEqual({
      userId: trip.driverId,
      kind: 'DRIVER',
    });
    expect(await actorFor(bookingId, { id: admin.id, role: 'ADMIN' })).toEqual({ userId: admin.id, kind: 'ADMIN' });
    // A stranger gets a party kind that transition() will reject with NOT_ALLOWED.
    const s = await actorFor(bookingId, { id: stranger.id, role: 'USER' });
    expect(await transition(bookingId, 'CANCEL', s)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });
});

describe('queries', () => {
  it('listPassengerBookings returns trip summary, newest first', async () => {
    const p = await createUser();
    const driver = await createUser({ name: 'Asha Rao', image: 'https://example.com/a.png' });
    const t1 = await createTrip({ driverId: driver.id, destLabel: 'Agra' });
    const t2 = await createTrip({ driverId: driver.id, destLabel: 'Jaipur' });
    await requestBooking(p.id, t1.id, 1);
    await requestBooking(p.id, t2.id, 2);
    const list = await listPassengerBookings(p.id);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      seats: 2,
      status: 'REQUESTED',
      trip: {
        id: t2.id,
        originLabel: 'Delhi',
        destLabel: 'Jaipur',
        pricePerSeat: t2.pricePerSeat,
        driver: { name: 'Asha Rao', image: 'https://example.com/a.png' },
      },
    });
    expect(list[0].trip.departureAt).toBeInstanceOf(Date);
    expect(list[1].trip.id).toBe(t1.id);
    expect(await listPassengerBookings(driver.id)).toEqual([]);
  });

  it('listTripBookings returns passenger summary without email; phone only once ACCEPTED', async () => {
    const trip = await createTrip();
    const a = await createUser({ name: 'Ravi', phone: '+919812345678' });
    const b = await createUser({ name: 'Meera', phone: '+919876543210' });
    const ra = await requestBooking(a.id, trip.id, 1);
    await requestBooking(b.id, trip.id, 1);
    if (!ra.ok) throw new Error('setup');
    await transition(ra.data.bookingId, 'ACCEPT', { userId: trip.driverId, kind: 'DRIVER' });

    const list = await listTripBookings(trip.id);
    expect(list.map((x) => x.passenger.name)).toEqual(['Meera', 'Ravi']);
    expect(list[0].passenger).toMatchObject({ phone: null, ratingAvg: 0, ratingCount: 0 });
    expect(list[1].passenger).toMatchObject({ phone: '+919812345678' });
    expect(list[1].passenger).not.toHaveProperty('email');
  });
});

describe('dashboard reads', () => {
  it('listPassengerBookings reveals the driver phone only for ACCEPTED/COMPLETED', async () => {
    const driver = await createUser({ phone: '+919811111111' });
    const p = await createUser();
    const t1 = await createTrip({ driverId: driver.id });
    const t2 = await createTrip({ driverId: driver.id });
    const r1 = await requestBooking(p.id, t1.id, 1);
    await requestBooking(p.id, t2.id, 1);
    if (!r1.ok) throw new Error('setup');
    await transition(r1.data.bookingId, 'ACCEPT', { userId: driver.id, kind: 'DRIVER' });

    const list = await listPassengerBookings(p.id);
    const byTrip = new Map(list.map((b) => [b.trip.id, b]));
    expect(byTrip.get(t1.id)?.trip.driver.phone).toBe('+919811111111');
    expect(byTrip.get(t2.id)?.trip.driver.phone).toBeNull();
    expect(byTrip.get(t1.id)?.trip.driver).not.toHaveProperty('email');
  });

  it('findActiveBooking returns the open booking (with driver phone once accepted) or null', async () => {
    const driver = await createUser({ phone: '+919811111111' });
    const trip = await createTrip({ driverId: driver.id });
    const p = await createUser();
    expect(await findActiveBooking(p.id, trip.id)).toBeNull();
    const r = await requestBooking(p.id, trip.id, 2);
    if (!r.ok) throw new Error('setup');
    expect(await findActiveBooking(p.id, trip.id)).toMatchObject({ id: r.data.bookingId, seats: 2, status: 'REQUESTED', driverPhone: null });
    await transition(r.data.bookingId, 'ACCEPT', { userId: driver.id, kind: 'DRIVER' });
    expect(await findActiveBooking(p.id, trip.id)).toMatchObject({ status: 'ACCEPTED', driverPhone: '+919811111111' });
    await transition(r.data.bookingId, 'CANCEL', { userId: p.id, kind: 'PASSENGER' });
    expect(await findActiveBooking(p.id, trip.id)).toBeNull();
  });

  it("listDriverTrips returns only the driver's trips with masked passenger summaries", async () => {
    const trip = await createTrip();
    const other = await createTrip();
    const a = await createUser({ name: 'Ravi', phone: '+919812345678' });
    const b = await createUser({ name: 'Meera', phone: '+919876543210' });
    const ra = await requestBooking(a.id, trip.id, 1);
    await requestBooking(b.id, trip.id, 1);
    await requestBooking(a.id, other.id, 1);
    if (!ra.ok) throw new Error('setup');
    await transition(ra.data.bookingId, 'ACCEPT', { userId: trip.driverId, kind: 'DRIVER' });

    const trips = await listDriverTrips(trip.driverId);
    expect(trips.map((t) => t.id)).toEqual([trip.id]);
    const [t] = trips;
    expect(t).toMatchObject({ originLabel: 'Delhi', destLabel: 'Jaipur', seatsAvailable: 1 });
    const byName = new Map(t.bookings.map((x) => [x.passenger.name, x]));
    expect(byName.get('Ravi')?.passenger).toMatchObject({ phone: '+919812345678', ratingAvg: 0 });
    expect(byName.get('Meera')?.passenger.phone).toBeNull();
    expect(byName.get('Meera')?.passenger).not.toHaveProperty('email');
  });
});

describe('trip status guards (R17)', () => {
  it('passenger cancel of ACCEPTED within 24 h on a CANCELLED trip refunds in full', async () => {
    const { trip, bookingId, driver, pax } = await booked(1, { departureAt: new Date(Date.now() + 5 * HOUR) });
    await transition(bookingId, 'ACCEPT', driver);
    await db.trip.update({ where: { id: trip.id }, data: { status: 'CANCELLED' } });
    const res = await transition(bookingId, 'CANCEL', pax);
    expect(res).toMatchObject({ ok: true, data: { status: 'CANCELLED', cancelledBy: 'PASSENGER' } });
    if (res.ok) expect(res.data.refundAmount).toBe(res.data.amount);
    expect(await seatsLeft(trip.id)).toBe(3);
  });

  it('ACCEPT and REJECT on a trip that is not PUBLISHED → INVALID_STATE', async () => {
    const { trip, bookingId, driver } = await booked(1);
    await db.trip.update({ where: { id: trip.id }, data: { status: 'CANCELLED' } });
    expect(await transition(bookingId, 'ACCEPT', driver)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect(await transition(bookingId, 'REJECT', driver)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('REQUESTED');
  });

  it('hides the driver phone from an ACCEPTED booking once the trip is CANCELLED', async () => {
    const driverUser = await createUser({ phone: '+919811111111' });
    const { trip, bookingId, driver, passenger } = await booked(1, { driverId: driverUser.id });
    await transition(bookingId, 'ACCEPT', driver);
    await db.trip.update({ where: { id: trip.id }, data: { status: 'CANCELLED' } });
    expect((await listPassengerBookings(passenger.id))[0].trip.driver.phone).toBeNull();
    expect(await findActiveBooking(passenger.id, trip.id)).toMatchObject({ status: 'ACCEPTED', driverPhone: null });
  });
});
