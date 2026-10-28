import type { Booking, CancelledBy, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { err, ok, type Result } from '@/lib/result';
import * as payments from '@/modules/payments/service';
import {
  allowedActor,
  computeExpiresAt,
  nextStatus,
  refundAmount,
  returnsSeats,
  type ActorKind,
  type BookingEvent,
  type BookingStatus,
} from './transitions';

export type Actor = { userId: string | null; kind: ActorKind };

const MIN_REQUEST_LEAD_MS = 60 * 60 * 1000;
const MIN_SEATS = 1;
const MAX_SEATS = 4;
const CLOSED = 'This trip is no longer taking requests';
// Concurrent requests queue on the Trip row lock; give them room instead of Prisma's 2 s / 5 s defaults.
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

function prismaCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null ? (e as { code?: string }).code : undefined;
}

/**
 * Deadlock (40P01) or serialization failure (40001). Prisma reports these as P2034, as P2010 with
 * meta.code, or (seen for a deadlock inside an interactive transaction) as an unknown request error
 * whose message carries the Postgres code.
 */
function isTxConflict(e: unknown): boolean {
  if (prismaCode(e) === 'P2034') return true;
  const metaCode = (e as { meta?: { code?: unknown } } | null)?.meta?.code;
  if (metaCode === '40P01' || metaCode === '40001') return true;
  return e instanceof Error && /\b40P01\b|\b40001\b|deadlock detected|could not serialize/.test(e.message);
}

/** Run a transaction body; on a deadlock or serialization failure retry once, then ask the user to retry. */
async function withConflictRetry<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (!isTxConflict(e)) throw e;
      if (attempt >= 2) return err('INVALID_STATE', 'Please try again');
    }
  }
}

/** Thrown inside a transaction to roll it back and return `result` to the caller. */
class Rollback extends Error {
  constructor(readonly result: Result<never>) {
    super(result.ok ? 'rollback' : result.message);
  }
}

type HeldTrip = { driverId: string; departureAt: Date; pricePerSeat: number };

/*
 * Lock order. transition() locks the Booking row (FOR UPDATE), then the Trip row (seat-return UPDATE).
 * requestBooking() locks the Trip row (seat-hold UPDATE), then inserts a Booking, which waits on any
 * conflicting entry in booking_one_active_per_passenger that another transaction is changing — so a
 * passenger cancelling b1 while re-requesting the same trip can deadlock (40P01). Both functions retry
 * once on deadlock/serialization failure (withConflictRetry). Rule for future cascades (e.g. driver
 * cancels a trip): lock the trip's Booking rows before the Trip row, matching transition().
 */

/**
 * Request seats on a trip. Seats are held atomically by a single conditional UPDATE (spec §5.3 rule 1)
 * whose RETURNING row (locked) supplies the values every rule and the amount are checked against; the
 * booking insert runs in the same transaction, so any failure afterwards rolls the hold back.
 * M1 creates the booking directly in REQUESTED; M5 changes the initial status to PENDING_PAYMENT.
 */
export async function requestBooking(
  passengerId: string,
  tripId: string,
  seats: number,
  now: Date = new Date(),
): Promise<Result<{ bookingId: string; clientSecret: string | null }>> {
  if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
    return err('VALIDATION', 'You can request between 1 and 4 seats');
  }
  const tooLate = (departureAt: Date) => departureAt.getTime() <= now.getTime() + MIN_REQUEST_LEAD_MS;

  const created = await withConflictRetry(async () => {
    try {
      return await db.$transaction(async (tx): Promise<Result<{ id: string; amount: number }>> => {
        const [held] = await tx.$queryRaw<HeldTrip[]>`
          UPDATE "Trip" SET "seatsAvailable" = "seatsAvailable" - ${seats}
          WHERE "id" = ${tripId} AND "seatsAvailable" >= ${seats} AND "status" = 'PUBLISHED'
          RETURNING "driverId", "departureAt", "pricePerSeat"`;

        if (!held) {
          // No hold taken: classify why from a plain read (nothing to roll back).
          const trip = await tx.trip.findUnique({
            where: { id: tripId },
            select: { driverId: true, status: true, departureAt: true },
          });
          if (!trip) return err('NOT_FOUND', 'Trip not found');
          if (trip.driverId === passengerId) return err('NOT_ALLOWED', "You can't book your own trip");
          if (trip.status !== 'PUBLISHED' || tooLate(trip.departureAt)) return err('INVALID_STATE', CLOSED);
          return err('TRIP_FULL', 'Not enough seats left on this trip');
        }
        // Rules checked against the locked row; a failure throws so the hold rolls back.
        if (held.driverId === passengerId) throw new Rollback(err('NOT_ALLOWED', "You can't book your own trip"));
        if (tooLate(held.departureAt)) throw new Rollback(err('INVALID_STATE', CLOSED));

        const amount = seats * held.pricePerSeat;
        const booking = await tx.booking.create({
          data: {
            tripId,
            passengerId,
            seats,
            amount,
            status: 'REQUESTED',
            expiresAt: computeExpiresAt(now, held.departureAt),
          },
          select: { id: true },
        });
        return ok({ id: booking.id, amount });
      }, TX_OPTIONS);
    } catch (e) {
      // Thrown errors roll the transaction back, including the seat hold.
      if (e instanceof Rollback) return e.result;
      if (prismaCode(e) === 'P2002') return err('INVALID_STATE', 'You already have a booking on this trip');
      // trip_seats_chk cannot fire given the conditional UPDATE; map it defensively.
      if (e instanceof Error && e.message.includes('trip_seats_chk')) {
        return err('TRIP_FULL', 'Not enough seats left on this trip');
      }
      throw e;
    }
  });
  if (!created.ok) return created;

  // M1: always succeeds. M5: a failure here leaves a PENDING_PAYMENT booking that the cron reconcile abandons.
  const auth = await payments.authorize({ id: created.data.id, amount: created.data.amount });
  if (!auth.ok) return auth;
  return ok({ bookingId: created.data.id, clientSecret: auth.data.clientSecret });
}

type LockedBooking = Pick<Booking, 'id' | 'tripId' | 'passengerId' | 'seats' | 'amount' | 'expiresAt'> & {
  status: BookingStatus;
};

function isParty(actor: Actor, booking: LockedBooking, driverId: string): boolean {
  switch (actor.kind) {
    case 'ADMIN':
    case 'SYSTEM': // SYSTEM may only perform SYSTEM events; allowedActor enforces that.
      return true;
    case 'PASSENGER':
      return actor.userId !== null && actor.userId === booking.passengerId;
    case 'DRIVER':
      return actor.userId !== null && actor.userId === driverId;
  }
}

/**
 * The only code that changes Booking.status after creation (spec §5.3 rule 2). Locks the Booking row,
 * then (via the seat-return UPDATE) the Trip row — see the lock-order note above.
 *
 * A driver's ACCEPT or REJECT of a REQUESTED booking at or after expiresAt expires it inline instead
 * (normal EXPIRE path: release + seats returned), commits that, and returns INVALID_STATE.
 */
export async function transition(
  bookingId: string,
  event: BookingEvent,
  actor: Actor,
  now: Date = new Date(),
): Promise<Result<Booking>> {
  return withConflictRetry(async () => {
    try {
      const outcome = await db.$transaction(async (tx): Promise<Result<Booking> | { expired: true }> => {
        const [booking] = await tx.$queryRaw<LockedBooking[]>`
          SELECT "id", "tripId", "passengerId", "seats", "amount", "expiresAt", "status"::text AS "status"
          FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
        if (!booking) return err('NOT_FOUND', 'Booking not found');

        const trip = await tx.trip.findUniqueOrThrow({
          where: { id: booking.tripId },
          select: { driverId: true, departureAt: true, status: true },
        });
        // Party check before any state check so non-parties learn nothing about the booking.
        if (!isParty(actor, booking, trip.driverId)) {
          return err('NOT_ALLOWED', "You can't change this booking");
        }
        const from = booking.status;
        const to = nextStatus(from, event);
        if (!to) return err('INVALID_STATE', 'This booking can no longer be changed that way');
        if (!allowedActor(event, actor.kind)) return err('NOT_ALLOWED', "You can't change this booking");
        if ((event === 'ACCEPT' || event === 'REJECT') && trip.status !== 'PUBLISHED') {
          return err('INVALID_STATE', CLOSED);
        }

        const lapsed =
          from === 'REQUESTED' &&
          (event === 'ACCEPT' || event === 'REJECT') &&
          booking.expiresAt !== null &&
          booking.expiresAt.getTime() <= now.getTime();
        if (lapsed) {
          await apply(tx, booking, 'EXPIRE', 'EXPIRED', { userId: null, kind: 'SYSTEM' }, 0);
          return { expired: true }; // returned (not thrown) so the expiry commits
        }

        // On a trip the driver (or an admin) cancelled, every cancel refunds like a driver cancel (spec §5.3
        // rule 4) — covers passengers and the cron re-cancel of bookings a failed cascade left open (R17).
        // cancelledBy still records who actually cancelled.
        const refundActor = trip.status === 'CANCELLED' ? 'DRIVER' : actor.kind;
        const refund =
          event === 'CANCEL'
            ? refundAmount({ status: from, amount: booking.amount }, trip.departureAt, now, refundActor)
            : 0;
        return ok(await apply(tx, booking, event, to, actor, refund));
      }, TX_OPTIONS);
      // The transaction has committed here; the inline expiry stands even though the caller gets an error.
      if ('expired' in outcome) return err('INVALID_STATE', 'This request has expired');
      return outcome;
    } catch (e) {
      if (e instanceof Rollback) return e.result;
      throw e;
    }
  });
}

type Tx = Prisma.TransactionClient;

/** Payment side effect, status write and seat return for an already-validated move, inside `tx`. */
async function apply(
  tx: Tx,
  booking: LockedBooking,
  event: BookingEvent,
  to: BookingStatus,
  actor: Actor,
  refund: number,
): Promise<Booking> {
  const from = booking.status;
  // Payment side effect before the status write (spec §6: DB state changes only after the payment call
  // succeeds). M1 calls are no-ops. M5 may move external calls out of this DB transaction (with
  // idempotency keys `${bookingId}:${action}`) to avoid holding row locks across network calls.
  let paid: Result<void> | null = null;
  if (event === 'ACCEPT') paid = await payments.capture(booking.id);
  else if (returnsSeats(to) && from !== 'ACCEPTED') paid = await payments.release(booking.id);
  else if (event === 'CANCEL' && from === 'ACCEPTED' && refund > 0) {
    paid = await payments.refund(booking.id, refund);
  }
  if (paid && !paid.ok) throw new Rollback(err('PAYMENT_FAILED', paid.message));

  const updated = await tx.booking.update({
    where: { id: booking.id },
    data: {
      status: to,
      ...(event === 'CANCEL' ? { cancelledBy: actor.kind as CancelledBy, refundAmount: refund } : {}),
    },
  });
  if (returnsSeats(to)) {
    await tx.$executeRaw`
      UPDATE "Trip" SET "seatsAvailable" = "seatsAvailable" + ${booking.seats}
      WHERE "id" = ${booking.tripId}`;
  }
  return updated;
}

/**
 * Derive the acting role of a signed-in user for a booking. Parties act as themselves (so cancelledBy
 * records PASSENGER/DRIVER even for admins who are parties); other admins act as ADMIN. Anyone else gets a
 * PASSENGER actor that transition() rejects with NOT_ALLOWED. Party ids never change, so reading outside
 * the transition's lock is safe.
 */
export async function actorFor(bookingId: string, user: { id: string; role: 'USER' | 'ADMIN' }): Promise<Actor> {
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    select: { passengerId: true, trip: { select: { driverId: true } } },
  });
  if (b?.passengerId === user.id) return { userId: user.id, kind: 'PASSENGER' };
  if (b?.trip.driverId === user.id) return { userId: user.id, kind: 'DRIVER' };
  if (user.role === 'ADMIN') return { userId: user.id, kind: 'ADMIN' };
  return { userId: user.id, kind: 'PASSENGER' };
}

const PHONE_VISIBLE: ReadonlySet<BookingStatus> = new Set(['ACCEPTED', 'COMPLETED']);

/** Phone numbers are revealed between driver and passenger only while ACCEPTED or COMPLETED (spec §5.3 rule 5). */
function visiblePhone(status: BookingStatus, phone: string | null): string | null {
  return PHONE_VISIBLE.has(status) ? phone : null;
}

/** Statuses a booking can still move out of; at most one per passenger per trip. */
const OPEN: BookingStatus[] = ['PENDING_PAYMENT', 'REQUESTED', 'ACCEPTED'];

/**
 * A passenger's bookings with a trip summary, newest first. The driver's phone is present only while
 * the booking is ACCEPTED or COMPLETED and the trip has not been cancelled.
 */
export async function listPassengerBookings(passengerId: string) {
  const rows = await db.booking.findMany({
    where: { passengerId },
    orderBy: { createdAt: 'desc' },
    include: {
      trip: {
        select: {
          id: true,
          originLabel: true,
          destLabel: true,
          departureAt: true,
          pricePerSeat: true,
          status: true,
          driver: { select: { id: true, name: true, image: true, phone: true } },
        },
      },
    },
  });
  return rows.map((b) => ({
    ...b,
    trip: {
      ...b.trip,
      driver: {
        ...b.trip.driver,
        phone: b.trip.status === 'CANCELLED' ? null : visiblePhone(b.status, b.trip.driver.phone),
      },
    },
  }));
}
export type PassengerBooking = Awaited<ReturnType<typeof listPassengerBookings>>[number];

/**
 * The passenger's open booking on a trip (for the trip page), with the driver's phone once accepted
 * (never on a cancelled trip).
 */
export async function findActiveBooking(passengerId: string, tripId: string) {
  const b = await db.booking.findFirst({
    where: { passengerId, tripId, status: { in: OPEN } },
    select: {
      id: true,
      seats: true,
      amount: true,
      status: true,
      trip: { select: { status: true, driver: { select: { phone: true } } } },
    },
  });
  if (!b) return null;
  const { trip, ...rest } = b;
  return {
    ...rest,
    tripCancelled: trip.status === 'CANCELLED',
    driverPhone: trip.status === 'CANCELLED' ? null : visiblePhone(b.status, trip.driver.phone),
  };
}
export type ActiveBooking = NonNullable<Awaited<ReturnType<typeof findActiveBooking>>>;

const PASSENGER_SUMMARY = {
  select: { id: true, name: true, image: true, ratingAvg: true, ratingCount: true, phone: true },
} as const;

function maskPassenger<
  B extends { status: BookingStatus; passenger: { ratingAvg: Prisma.Decimal; phone: string | null } },
>(b: B) {
  return {
    ...b,
    passenger: {
      ...b.passenger,
      ratingAvg: Number(b.passenger.ratingAvg),
      phone: visiblePhone(b.status, b.passenger.phone),
    },
  };
}

/**
 * A trip's bookings with a passenger summary, newest first. Never includes email; the phone number is
 * only present while the booking is ACCEPTED or COMPLETED (spec §5.3 rule 5). No authorization here:
 * callers must pass requireTripDriver (or be an admin) first.
 */
export async function listTripBookings(tripId: string) {
  const rows = await db.booking.findMany({
    where: { tripId },
    orderBy: { createdAt: 'desc' },
    include: { passenger: PASSENGER_SUMMARY },
  });
  return rows.map(maskPassenger);
}
export type TripBooking = Awaited<ReturnType<typeof listTripBookings>>[number];

/**
 * The driver dashboard: the driver's own trips (soonest departure first) with each trip's bookings and
 * masked passenger summaries. Scoped by driverId in the query, so it needs no further authorization.
 */
export async function listDriverTrips(driverId: string) {
  const trips = await db.trip.findMany({
    where: { driverId },
    orderBy: { departureAt: 'asc' },
    select: {
      id: true,
      originLabel: true,
      destLabel: true,
      departureAt: true,
      seatsTotal: true,
      seatsAvailable: true,
      pricePerSeat: true,
      status: true,
      bookings: { orderBy: { createdAt: 'desc' }, include: { passenger: PASSENGER_SUMMARY } },
    },
  });
  return trips.map((t) => ({ ...t, bookings: t.bookings.map(maskPassenger) }));
}
export type DriverTrip = Awaited<ReturnType<typeof listDriverTrips>>[number];
