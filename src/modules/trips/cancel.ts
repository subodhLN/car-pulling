import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/lib/result';
import { transition, type Actor } from '@/modules/bookings/service';
import type { BookingStatus } from '@/modules/bookings/transitions';

/** Statuses a CANCEL event can leave from (PENDING_PAYMENT only exists from M5). */
const CANCELLABLE: BookingStatus[] = ['PENDING_PAYMENT', 'REQUESTED', 'ACCEPTED'];

const LEFT = 'This trip has already left';

export type CancelTripResult = { cancelledBookings: number; failedBookingIds: string[] };

/**
 * Driver (or admin) cancels a published trip (spec §5.3 rule 4): the trip becomes CANCELLED and every
 * open booking goes through transition(id, 'CANCEL', actor) — requests are released, accepted bookings
 * are refunded in full (refundAmount gives DRIVER/ADMIN cancels the full amount).
 *
 * Order and locking:
 * 1. The trip flips PUBLISHED → CANCELLED in one conditional UPDATE, in its own short transaction that
 *    takes only the Trip row lock. requestBooking's seat-hold UPDATE requires status = 'PUBLISHED', so
 *    once this commits no new booking can be created. A request already holding the Trip row lock makes
 *    this UPDATE wait until it commits; its booking is then committed and is found by step 2.
 * 2. Each open booking is cancelled by transition() in its own transaction, which locks Booking then Trip
 *    — the same order as every other transition, and step 1 holds no lock while it runs — so no lock
 *    cycle with passenger cancels (Booking → Trip) or requests (Trip → Booking insert) can form.
 * A booking whose transition fails or throws (e.g. PAYMENT_FAILED) is logged and reported in
 * failedBookingIds; the rest still run. The cron tick re-cancels any open booking left on a CANCELLED trip,
 * and transition() refunds such bookings in full whoever cancels them. Bookings another party moved concurrently (e.g. the passenger cancelled first) are
 * simply skipped.
 */
export async function cancelTrip(
  tripId: string,
  actor: Actor,
  now: Date = new Date(),
): Promise<Result<CancelTripResult>> {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { driverId: true, departureAt: true } });
  if (!trip) return err('NOT_FOUND', 'Trip not found');
  const allowed =
    actor.kind === 'ADMIN' || (actor.kind === 'DRIVER' && actor.userId !== null && actor.userId === trip.driverId);
  if (!allowed) return err('NOT_ALLOWED', "You can't cancel this trip");
  if (trip.departureAt.getTime() <= now.getTime()) return err('INVALID_STATE', LEFT);

  const flipped = await db.$executeRaw`
    UPDATE "Trip" SET "status" = 'CANCELLED'
    WHERE "id" = ${tripId} AND "status" = 'PUBLISHED' AND "departureAt" > ${now}`;
  if (flipped === 0) return err('INVALID_STATE', 'This trip can no longer be cancelled');

  const open = await db.booking.findMany({
    where: { tripId, status: { in: CANCELLABLE } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  let cancelledBookings = 0;
  const failedBookingIds: string[] = [];
  for (const { id } of open) {
    let res: Awaited<ReturnType<typeof transition>>;
    try {
      res = await transition(id, 'CANCEL', actor, now);
    } catch (e) {
      // e.g. a dropped connection: keep going; the cron tick re-cancels it (runTick, R17).
      logger.error({ err: e, tripId, bookingId: id }, 'cancelTrip: booking cancel threw');
      failedBookingIds.push(id);
      continue;
    }
    if (res.ok) {
      cancelledBookings += 1;
      continue;
    }
    // INVALID_STATE because someone else already closed it is fine; anything left open is a failure.
    const current = await db.booking.findUnique({ where: { id }, select: { status: true } });
    if (current && CANCELLABLE.includes(current.status)) {
      logger.error({ tripId, bookingId: id, code: res.code, message: res.message }, 'cancelTrip: booking not cancelled');
      failedBookingIds.push(id);
    }
  }
  return ok({ cancelledBookings, failedBookingIds });
}
