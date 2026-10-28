import type { Booking, CancelledBy } from '@prisma/client';
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
// Concurrent requests queue on the Trip row lock; give them room instead of Prisma's 2 s / 5 s defaults.
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

function prismaCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null ? (e as { code?: string }).code : undefined;
}

/**
 * Request seats on a trip. Seats are held atomically by a single conditional UPDATE (spec §5.3 rule 1);
 * the booking insert runs in the same transaction, so a duplicate-booking violation rolls the hold back.
 * M1 creates the booking directly in REQUESTED; M5 changes the initial status to PENDING_PAYMENT.
 */
export async function requestBooking(
  passengerId: string,
  tripId: string,
  seats: number,
  now: Date = new Date(),
): Promise<Result<{ bookingId: string; clientSecret: string | null }>> {
  let created: Result<{ id: string; amount: number }>;
  try {
    created = await db.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: { driverId: true, status: true, departureAt: true, pricePerSeat: true },
      });
      if (!trip) return err('NOT_FOUND', 'Trip not found');
      if (trip.driverId === passengerId) return err('NOT_ALLOWED', "You can't book your own trip");
      if (trip.status !== 'PUBLISHED' || trip.departureAt.getTime() <= now.getTime() + MIN_REQUEST_LEAD_MS) {
        return err('INVALID_STATE', 'This trip is no longer taking requests');
      }
      if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
        return err('VALIDATION', 'You can request between 1 and 4 seats');
      }

      const held = await tx.$executeRaw`
        UPDATE "Trip" SET "seatsAvailable" = "seatsAvailable" - ${seats}
        WHERE "id" = ${tripId} AND "seatsAvailable" >= ${seats} AND "status" = 'PUBLISHED'`;
      if (held === 0) return err('TRIP_FULL', 'Not enough seats left on this trip');

      const amount = seats * trip.pricePerSeat;
      const booking = await tx.booking.create({
        data: {
          tripId,
          passengerId,
          seats,
          amount,
          status: 'REQUESTED',
          expiresAt: computeExpiresAt(now, trip.departureAt),
        },
        select: { id: true },
      });
      return ok({ id: booking.id, amount });
    }, TX_OPTIONS);
  } catch (e) {
    // Thrown errors roll the transaction back, including the seat hold.
    const code = prismaCode(e);
    if (code === 'P2002') return err('INVALID_STATE', 'You already have a booking on this trip');
    // trip_seats_chk cannot fire given the conditional UPDATE; map it defensively.
    if (e instanceof Error && e.message.includes('trip_seats_chk')) {
      return err('TRIP_FULL', 'Not enough seats left on this trip');
    }
    throw e;
  }
  if (!created.ok) return created;

  // M1: always succeeds. M5: a failure here leaves a PENDING_PAYMENT booking that the cron reconcile abandons.
  const auth = await payments.authorize({ id: created.data.id, amount: created.data.amount });
  if (!auth.ok) return auth;
  return ok({ bookingId: created.data.id, clientSecret: auth.data.clientSecret });
}

/** Thrown inside the transaction to roll it back when the payment side effect fails. */
class PaymentFailed extends Error {
  constructor(readonly result: Result<never>) {
    super('payment failed');
  }
}

type LockedBooking = Pick<Booking, 'id' | 'tripId' | 'passengerId' | 'seats' | 'amount'> & {
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
 * The only code that changes Booking.status after creation (spec §5.3 rule 2).
 * Lock order is always Booking row first, then Trip row, so cascades cannot deadlock against this.
 */
export async function transition(
  bookingId: string,
  event: BookingEvent,
  actor: Actor,
  now: Date = new Date(),
): Promise<Result<Booking>> {
  try {
    return await db.$transaction(async (tx) => {
      const [booking] = await tx.$queryRaw<LockedBooking[]>`
        SELECT "id", "tripId", "passengerId", "seats", "amount", "status"::text AS "status"
        FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
      if (!booking) return err('NOT_FOUND', 'Booking not found');

      const trip = await tx.trip.findUniqueOrThrow({
        where: { id: booking.tripId },
        select: { driverId: true, departureAt: true },
      });
      // Party check before any state check so non-parties learn nothing about the booking.
      if (!isParty(actor, booking, trip.driverId)) {
        return err('NOT_ALLOWED', "You can't change this booking");
      }
      const from = booking.status;
      const to = nextStatus(from, event);
      if (!to) return err('INVALID_STATE', 'This booking can no longer be changed that way');
      if (!allowedActor(event, actor.kind)) return err('NOT_ALLOWED', "You can't change this booking");

      const refund =
        event === 'CANCEL'
          ? refundAmount({ status: from, amount: booking.amount }, trip.departureAt, now, actor.kind)
          : 0;

      // Payment side effect before the status write (spec §6: DB state changes only after the payment call
      // succeeds). M1 calls are no-ops. M5 may move external calls out of this DB transaction (with
      // idempotency keys `${bookingId}:${action}`) to avoid holding row locks across network calls.
      let paid: Result<void> | null = null;
      if (event === 'ACCEPT') paid = await payments.capture(booking.id);
      else if (returnsSeats(to) && from !== 'ACCEPTED') paid = await payments.release(booking.id);
      else if (event === 'CANCEL' && from === 'ACCEPTED' && refund > 0) {
        paid = await payments.refund(booking.id, refund);
      }
      if (paid && !paid.ok) throw new PaymentFailed(err('PAYMENT_FAILED', paid.message));

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
      return ok(updated);
    }, TX_OPTIONS);
  } catch (e) {
    if (e instanceof PaymentFailed) return e.result;
    throw e;
  }
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

/** A passenger's bookings with a trip summary, newest first. */
export async function listPassengerBookings(passengerId: string) {
  return db.booking.findMany({
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
          driver: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });
}
export type PassengerBooking = Awaited<ReturnType<typeof listPassengerBookings>>[number];

const PHONE_VISIBLE: ReadonlySet<BookingStatus> = new Set(['ACCEPTED', 'COMPLETED']);

/**
 * A trip's bookings with a passenger summary, newest first. Never includes email; the phone number is
 * only present while the booking is ACCEPTED or COMPLETED (spec §5.3 rule 5).
 */
export async function listTripBookings(tripId: string) {
  const rows = await db.booking.findMany({
    where: { tripId },
    orderBy: { createdAt: 'desc' },
    include: {
      passenger: {
        select: { id: true, name: true, image: true, ratingAvg: true, ratingCount: true, phone: true },
      },
    },
  });
  return rows.map((b) => ({
    ...b,
    passenger: {
      ...b.passenger,
      ratingAvg: Number(b.passenger.ratingAvg),
      phone: PHONE_VISIBLE.has(b.status) ? b.passenger.phone : null,
    },
  }));
}
export type TripBooking = Awaited<ReturnType<typeof listTripBookings>>[number];
