import { beforeEach, describe, expect, it } from 'vitest';
import type { BookingStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { listReviewsFor, pendingReviews, postReview, reviewDeadline } from '@/modules/reviews/service';
import { resetDb } from '../../helpers/db';
import { createTrip, createUser } from '../../helpers/factories';

beforeEach(resetDb);

const DAY = 24 * 60 * 60 * 1000;
const departureAt = new Date('2026-10-01T03:30:00Z');
const soon = new Date('2026-10-03T00:00:00Z'); // within the window

async function ride(status: BookingStatus = 'COMPLETED') {
  const driver = await createUser({ name: 'Rohit Sharma' });
  const passenger = await createUser({ name: 'Meera Kapoor' });
  const trip = await createTrip({ driverId: driver.id, departureAt, status: 'COMPLETED' });
  await db.booking.create({
    data: { tripId: trip.id, passengerId: passenger.id, seats: 1, amount: 45000, status },
  });
  return { driver, passenger, trip };
}

const ratingOf = async (id: string) => {
  const u = await db.user.findUniqueOrThrow({ where: { id } });
  return { avg: Number(u.ratingAvg), count: u.ratingCount };
};

describe('postReview', () => {
  it('passenger and driver of a COMPLETED booking can review each other once', async () => {
    const { driver, passenger, trip } = await ride();
    expect((await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating: 5 }, soon)).ok).toBe(true);
    expect((await postReview(driver.id, { tripId: trip.id, subjectId: passenger.id, rating: 4 }, soon)).ok).toBe(true);
    expect(await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating: 3 }, soon)).toEqual({
      ok: false,
      code: 'INVALID_STATE',
      message: "You've already reviewed this person for this trip",
    });
    expect(await ratingOf(driver.id)).toEqual({ avg: 5, count: 1 });
  });

  it.each<BookingStatus>(['REQUESTED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'])(
    'booking %s → NOT_ALLOWED',
    async (status) => {
      const { driver, passenger, trip } = await ride(status);
      expect(await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating: 5 }, soon)).toEqual({
        ok: false,
        code: 'NOT_ALLOWED',
        message: 'You can only review people you travelled with',
      });
    },
  );

  it('a stranger cannot review the driver', async () => {
    const { driver, trip } = await ride();
    const stranger = await createUser();
    const res = await postReview(stranger.id, { tripId: trip.id, subjectId: driver.id, rating: 1 }, soon);
    expect(res).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });

  it('cannot review yourself', async () => {
    const { driver, trip } = await ride();
    const res = await postReview(driver.id, { tripId: trip.id, subjectId: driver.id, rating: 5 }, soon);
    expect(res).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });

  it.each([0, 6, 4.5, Number.NaN])('rating %s → VALIDATION', async (rating) => {
    const { driver, passenger, trip } = await ride();
    const res = await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating }, soon);
    expect(res).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('comment is trimmed and limited to 500 characters', async () => {
    const { driver, passenger, trip } = await ride();
    const long = await postReview(
      passenger.id,
      { tripId: trip.id, subjectId: driver.id, rating: 5, comment: 'x'.repeat(501) },
      soon,
    );
    expect(long).toMatchObject({ ok: false, code: 'VALIDATION' });
    await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating: 5, comment: '  Smooth ride  ' }, soon);
    expect((await db.review.findFirstOrThrow()).comment).toBe('Smooth ride');
  });

  it('two concurrent posts create one review and count once', async () => {
    const { driver, passenger, trip } = await ride();
    const input = { tripId: trip.id, subjectId: driver.id, rating: 5 };
    const [a, b] = await Promise.all([postReview(passenger.id, input, soon), postReview(passenger.id, input, soon)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(await db.review.count()).toBe(1);
    expect(await ratingOf(driver.id)).toEqual({ avg: 5, count: 1 });
  });

  it('ratingAvg 5, 4, 4 → 4.33 with count 3; a single 1 → 1.00', async () => {
    const driver = await createUser();
    for (const rating of [5, 4, 4]) {
      const passenger = await createUser();
      const trip = await createTrip({ driverId: driver.id, departureAt, status: 'COMPLETED' });
      await db.booking.create({
        data: { tripId: trip.id, passengerId: passenger.id, seats: 1, amount: 45000, status: 'COMPLETED' },
      });
      await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating }, soon);
    }
    expect(await ratingOf(driver.id)).toEqual({ avg: 4.33, count: 3 });

    const { driver: d2, passenger: p2, trip: t2 } = await ride();
    await postReview(p2.id, { tripId: t2.id, subjectId: d2.id, rating: 1 }, soon);
    expect(await ratingOf(d2.id)).toEqual({ avg: 1, count: 1 });
  });

  it('is accepted at exactly the deadline and rejected 1 ms after', async () => {
    const { driver, passenger, trip } = await ride();
    const deadline = reviewDeadline(trip);
    expect(deadline.getTime()).toBe(departureAt.getTime() + 360 * 60 * 1000 + 14 * DAY);
    const late = await postReview(
      driver.id,
      { tripId: trip.id, subjectId: passenger.id, rating: 4 },
      new Date(deadline.getTime() + 1),
    );
    expect(late).toEqual({ ok: false, code: 'INVALID_STATE', message: 'The review window for this trip has closed' });
    expect((await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating: 4 }, deadline)).ok).toBe(true);
  });

  it('uses the stored duration for the deadline when known', async () => {
    const { trip } = await ride();
    const t = { ...trip, durationMin: 217 };
    expect(reviewDeadline(t).getTime()).toBe(departureAt.getTime() + 217 * 60 * 1000 + 14 * DAY);
  });
});

describe('pendingReviews', () => {
  it('lists both directions and drops reviewed or expired ones', async () => {
    const { driver, passenger, trip } = await ride();
    expect(await pendingReviews(passenger.id, soon)).toEqual([
      { tripId: trip.id, subjectId: driver.id, subjectName: 'Rohit Sharma', role: 'DRIVER' },
    ]);
    expect(await pendingReviews(driver.id, soon)).toEqual([
      { tripId: trip.id, subjectId: passenger.id, subjectName: 'Meera Kapoor', role: 'PASSENGER' },
    ]);
    await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating: 5 }, soon);
    expect(await pendingReviews(passenger.id, soon)).toEqual([]);
    expect(await pendingReviews(driver.id, new Date(reviewDeadline(trip).getTime() + 1))).toEqual([]);
  });

  it('ignores bookings that did not complete', async () => {
    const { passenger } = await ride('CANCELLED');
    expect(await pendingReviews(passenger.id, soon)).toEqual([]);
  });
});

describe('listReviewsFor', () => {
  it('returns newest first with only the author name and image', async () => {
    const { driver, passenger, trip } = await ride();
    await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating: 5, comment: 'Great' }, soon);
    const other = await createUser({ name: 'Arjun' });
    const t2 = await createTrip({ driverId: driver.id, departureAt, status: 'COMPLETED' });
    await db.booking.create({
      data: { tripId: t2.id, passengerId: other.id, seats: 1, amount: 45000, status: 'COMPLETED' },
    });
    await postReview(other.id, { tripId: t2.id, subjectId: driver.id, rating: 4 }, new Date(soon.getTime() + 1000));
    const list = await listReviewsFor(driver.id);
    expect(list.map((r) => r.rating)).toEqual([4, 5]);
    expect(Object.keys(list[0].author).sort()).toEqual(['id', 'image', 'name']);
  });
});
