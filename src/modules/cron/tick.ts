import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { transition, type Actor } from '@/modules/bookings/service';
import type { BookingEvent, BookingStatus } from '@/modules/bookings/transitions';

const BATCH = 100;
const SYSTEM: Actor = { userId: null, kind: 'SYSTEM' };
/** Assumed trip length when routing gave no duration (spec §5.6). */
const DEFAULT_DURATION_MIN = 360;

export type TickResult = {
  /** Bookings moved to EXPIRED (overdue requests, and requests left on completed trips). */
  expired: number;
  /** Trips moved to COMPLETED by this run. */
  completed: number;
};

/**
 * Walk bookings matching `where` in id order, 100 at a time, and apply `event` to each via transition()
 * as SYSTEM (so seats and payments are handled exactly once). Keyset pagination on id means a booking
 * whose transition fails is passed over rather than retried forever; the next tick picks it up again.
 * Returns how many transitions succeeded.
 */
async function sweep(
  where: { status: BookingStatus; expiresAt?: { lte: Date }; trip?: { status: 'COMPLETED' } },
  event: BookingEvent,
  now: Date,
): Promise<number> {
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const batch = await db.booking.findMany({
      where: { ...where, ...(after ? { id: { gt: after } } : {}) },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    for (const { id } of batch) {
      const res = await transition(id, event, SYSTEM, now);
      if (res.ok) done += 1;
      // INVALID_STATE here means another actor moved it first (e.g. the driver accepted) — expected.
      else if (res.code !== 'INVALID_STATE') {
        logger.error({ bookingId: id, event, code: res.code, message: res.message }, 'cron tick: transition failed');
      }
    }
    if (batch.length < BATCH) return done;
    after = batch[batch.length - 1].id;
  }
}

/** Mark finished trips COMPLETED, 100 per statement. Returns the number of trips completed. */
async function completeTrips(now: Date): Promise<number> {
  let total = 0;
  for (;;) {
    // Each statement only touches Trip rows (no Booking locks held), so it cannot deadlock with transition().
    const n = await db.$executeRaw`
      UPDATE "Trip" SET "status" = 'COMPLETED'
      WHERE "id" IN (
        SELECT "id" FROM "Trip"
        WHERE "status" = 'PUBLISHED'
          AND "departureAt" + make_interval(mins => COALESCE("durationMin", ${DEFAULT_DURATION_MIN}::int)) < ${now}
        ORDER BY "id" LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED)
      AND "status" = 'PUBLISHED'`;
    total += n;
    if (n < BATCH) return total;
  }
}

/**
 * The cron tick (spec §5.6). M1 runs steps 1 and 3; step 2 (payment reconcile) arrives in M5 and
 * step 4 (departure reminders) in M4. Every step is idempotent and works in batches of 100.
 *
 * 1. REQUESTED bookings with expiresAt ≤ now → EXPIRE.
 * 3. PUBLISHED trips with departureAt + (durationMin ?? 360) min < now → trip COMPLETED; then on every
 *    COMPLETED trip, ACCEPTED bookings → COMPLETE and leftover REQUESTED → EXPIRE. The booking sweep keys
 *    off the trip's COMPLETED status rather than "trips completed in this run", so a tick that dies between
 *    the two halves is finished by the next one.
 */
export async function runTick(now: Date = new Date()): Promise<TickResult> {
  let expired = await sweep({ status: 'REQUESTED', expiresAt: { lte: now } }, 'EXPIRE', now);
  const completed = await completeTrips(now);
  await sweep({ status: 'ACCEPTED', trip: { status: 'COMPLETED' } }, 'COMPLETE', now);
  expired += await sweep({ status: 'REQUESTED', trip: { status: 'COMPLETED' } }, 'EXPIRE', now);
  return { expired, completed };
}
