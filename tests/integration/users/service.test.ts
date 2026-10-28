import { beforeEach, describe, expect, it } from 'vitest';
import type { BookingStatus, TripStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { postReview } from '@/modules/reviews/service';
import { getPublicProfile, updateProfile } from '@/modules/users/service';
import { resetDb } from '../../helpers/db';
import { createTrip, createUser } from '../../helpers/factories';

beforeEach(resetDb);

const departureAt = new Date('2026-10-01T03:30:00Z');

async function booking(tripId: string, passengerId: string, status: BookingStatus) {
  return db.booking.create({ data: { tripId, passengerId, seats: 1, amount: 45000, status } });
}

describe('getPublicProfile', () => {
  it('has no email, phone or passwordHash keys', async () => {
    const u = await createUser({
      name: 'Rohit Sharma',
      phone: '+919876543210',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      bio: 'Weekend drives to the hills',
    });
    const p = await getPublicProfile(u.id);
    expect(p).not.toBeNull();
    expect(Object.keys(p!)).not.toEqual(expect.arrayContaining(['email']));
    for (const key of ['email', 'phone', 'passwordHash', 'role', 'status']) expect(p).not.toHaveProperty(key);
    expect(JSON.stringify(p)).not.toMatch(/@example\.com|\+91|\$2[aby]\$/);
    expect(p).toMatchObject({ name: 'Rohit Sharma', bio: 'Weekend drives to the hills', memberSince: u.createdAt });
  });

  it('includes reviews without leaking the author email', async () => {
    const driver = await createUser();
    const passenger = await createUser({ name: 'Meera' });
    const trip = await createTrip({ driverId: driver.id, departureAt, status: 'COMPLETED' });
    await booking(trip.id, passenger.id, 'COMPLETED');
    await postReview(passenger.id, { tripId: trip.id, subjectId: driver.id, rating: 5, comment: 'Great' }, new Date('2026-10-02T00:00:00Z'));
    const p = await getPublicProfile(driver.id);
    expect(p).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    expect(p!.reviews).toHaveLength(1);
    expect(p!.reviews[0]).toMatchObject({ rating: 5, comment: 'Great', author: { name: 'Meera' } });
    expect(JSON.stringify(p)).not.toMatch(/@example\.com/);
  });

  it('suspended or unknown users → null', async () => {
    const u = await createUser({ status: 'SUSPENDED' });
    expect(await getPublicProfile(u.id)).toBeNull();
    expect(await getPublicProfile('nope')).toBeNull();
  });

  it('counts completed rides as driver and as passenger only', async () => {
    const u = await createUser();
    const other = await createUser();
    for (const status of ['COMPLETED', 'COMPLETED', 'PUBLISHED', 'CANCELLED'] as TripStatus[]) {
      const t = await createTrip({ driverId: u.id, departureAt, status });
      await booking(t.id, other.id, status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED');
    }
    // A completed trip nobody rode on is not a ride.
    await createTrip({ driverId: u.id, departureAt, status: 'COMPLETED' });
    for (const status of ['COMPLETED', 'CANCELLED', 'REJECTED'] as BookingStatus[]) {
      const t = await createTrip({ driverId: other.id, departureAt, status: 'COMPLETED' });
      await booking(t.id, u.id, status);
    }
    expect(await getPublicProfile(u.id)).toMatchObject({ ridesAsDriver: 2, ridesAsPassenger: 1 });
  });

  it('badges reflect emailVerified and idVerified exactly', async () => {
    const a = await createUser();
    const b = await createUser({ emailVerified: new Date(), idVerified: true });
    expect(await getPublicProfile(a.id)).toMatchObject({ emailVerified: false, idVerified: false });
    expect(await getPublicProfile(b.id)).toMatchObject({ emailVerified: true, idVerified: true });
  });
});

describe('updateProfile', () => {
  it('trims, enforces limits and normalises phone; empty phone clears it', async () => {
    const u = await createUser({ phone: '+919876543210' });
    expect(await updateProfile(u.id, { name: '  Arjun Mehta ', bio: '  Early riser  ', phone: '098765 43211' })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({
      name: 'Arjun Mehta',
      bio: 'Early riser',
      phone: '+919876543211',
    });

    expect(await updateProfile(u.id, { name: '   ' })).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await updateProfile(u.id, { name: 'x'.repeat(81) })).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await updateProfile(u.id, { name: 'A', bio: 'x'.repeat(281) })).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await updateProfile(u.id, { name: 'A', phone: '12345' })).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Enter a 10-digit Indian mobile number',
    });

    expect((await updateProfile(u.id, { name: 'A', bio: '', phone: '' })).ok).toBe(true);
    expect(await db.user.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ name: 'A', bio: null, phone: null });
  });
});
