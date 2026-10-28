import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { err, ok, type Result } from '@/lib/result';
import { reviewInputSchema, type ReviewInput } from './schemas';

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
// Same fallback the cron uses to decide when a trip without a stored duration has arrived.
const DEFAULT_DURATION_MIN = 360;

/** Reviews close 14 days after the trip's arrival (departure + duration), spec §5.4. */
export function reviewDeadline(trip: { departureAt: Date; durationMin: number | null }): Date {
  const arrival = trip.departureAt.getTime() + (trip.durationMin ?? DEFAULT_DURATION_MIN) * 60_000;
  return new Date(arrival + WINDOW_MS);
}

export type ReviewTarget = {
  tripId: string;
  subjectId: string;
  subjectName: string;
  /** The subject's role on the trip. */
  role: 'DRIVER' | 'PASSENGER';
};

/** Recomputes the user's rating from their reviews (never incrementally). Used after every write. */
export async function recomputeRating(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "User" SET
      "ratingAvg" = COALESCE((SELECT ROUND(AVG("rating")::numeric, 2) FROM "Review" WHERE "subjectId" = ${userId}), 0),
      "ratingCount" = (SELECT COUNT(*) FROM "Review" WHERE "subjectId" = ${userId})::int
    WHERE "id" = ${userId}`;
}

/** Completed rides the user still has to review, both as driver and as passenger. */
export async function pendingReviews(userId: string, now: Date = new Date()): Promise<ReviewTarget[]> {
  const bookings = await db.booking.findMany({
    where: { status: 'COMPLETED', OR: [{ passengerId: userId }, { trip: { driverId: userId } }] },
    select: {
      passengerId: true,
      passenger: { select: { name: true } },
      trip: {
        select: {
          id: true,
          departureAt: true,
          durationMin: true,
          driverId: true,
          driver: { select: { name: true } },
          reviews: { where: { authorId: userId }, select: { subjectId: true } },
        },
      },
    },
    orderBy: { trip: { departureAt: 'desc' } },
  });
  const out: ReviewTarget[] = [];
  for (const b of bookings) {
    if (reviewDeadline(b.trip) < now) continue;
    const asPassenger = b.passengerId === userId;
    const target: ReviewTarget = asPassenger
      ? { tripId: b.trip.id, subjectId: b.trip.driverId, subjectName: b.trip.driver.name ?? 'Your driver', role: 'DRIVER' }
      : { tripId: b.trip.id, subjectId: b.passengerId, subjectName: b.passenger.name ?? 'Your passenger', role: 'PASSENGER' };
    if (target.subjectId === userId) continue;
    if (b.trip.reviews.some((r) => r.subjectId === target.subjectId)) continue;
    out.push(target);
  }
  return out;
}

const NOT_TRAVELLED = 'You can only review people you travelled with';

export async function postReview(
  authorId: string,
  input: ReviewInput,
  now: Date = new Date(),
): Promise<Result<{ id: string }>> {
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION', parsed.error.issues[0]?.message ?? 'Check your review');
  const { tripId, subjectId, rating, comment } = parsed.data;
  if (authorId === subjectId) return err('NOT_ALLOWED', NOT_TRAVELLED);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { driverId: true, departureAt: true, durationMin: true },
  });
  if (!trip) return err('NOT_ALLOWED', NOT_TRAVELLED);
  // The pair must be the driver and the passenger of a COMPLETED booking on this trip.
  const passengerId = authorId === trip.driverId ? subjectId : subjectId === trip.driverId ? authorId : null;
  const completed =
    passengerId !== null &&
    (await db.booking.count({ where: { tripId, passengerId, status: 'COMPLETED' } })) > 0;
  if (!completed) return err('NOT_ALLOWED', NOT_TRAVELLED);
  if (now > reviewDeadline(trip)) return err('INVALID_STATE', 'The review window for this trip has closed');

  try {
    const review = await db.$transaction(async (tx) => {
      // Lock the subject first: under READ COMMITTED the recompute's subqueries would otherwise use a snapshot
      // taken before a concurrent review of the same person committed, and drop it from the aggregate.
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${subjectId} FOR UPDATE`;
      const created = await tx.review.create({
        data: { tripId, authorId, subjectId, rating, comment: comment ?? null, createdAt: now },
        select: { id: true },
      });
      await recomputeRating(tx, subjectId);
      return created;
    });
    return ok(review);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return err('INVALID_STATE', "You've already reviewed this person for this trip");
    }
    throw e;
  }
}

export async function listReviewsFor(subjectId: string, limit = 10) {
  return db.review.findMany({
    where: { subjectId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      author: { select: { id: true, name: true, image: true } },
    },
  });
}

export type ReviewListItem = Awaited<ReturnType<typeof listReviewsFor>>[number];

/** The ratings `authorId` has given, keyed `tripId:subjectId`, for showing "You rated …" on the dashboards. */
export async function ratingsGivenBy(authorId: string): Promise<Map<string, number>> {
  const rows = await db.review.findMany({ where: { authorId }, select: { tripId: true, subjectId: true, rating: true } });
  return new Map(rows.map((r) => [reviewKey(r.tripId, r.subjectId), r.rating]));
}

export const reviewKey = (tripId: string, subjectId: string) => `${tripId}:${subjectId}`;
