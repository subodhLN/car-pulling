import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { requestBooking, transition } from '@/modules/bookings/service';
import { runTick } from '@/modules/cron/tick';
import { GET } from '@/app/api/cron/tick/route';
import { resetDb } from '../../helpers/db';
import { createTrip, createUser } from '../../helpers/factories';

beforeEach(resetDb);
afterEach(() => {
  vi.unstubAllEnvs();
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function book(tripId: string, seats: number, now = new Date()): Promise<string> {
  const p = await createUser();
  const res = await requestBooking(p.id, tripId, seats, now);
  if (!res.ok) throw new Error(`setup booking failed: ${res.code}`);
  return res.data.bookingId;
}
const status = async (id: string) => (await db.booking.findUniqueOrThrow({ where: { id } })).status;
const trip = async (id: string) => db.trip.findUniqueOrThrow({ where: { id } });

describe('runTick', () => {
  it('runTick expires overdue requests and returns their seats', async () => {
    const now = new Date();
    const t = await createTrip({ seatsTotal: 4, departureAt: new Date(now.getTime() + 3 * DAY) });
    const overdue = await book(t.id, 2, now);
    const fresh = await book(t.id, 1, new Date(now.getTime() + 2 * HOUR));
    expect((await trip(t.id)).seatsAvailable).toBe(1);

    // 25 h later: the first request (expiresAt = now + 24 h) lapsed; the second (now + 26 h) has not.
    const res = await runTick(new Date(now.getTime() + 25 * HOUR));
    expect(res).toEqual({ expired: 1, completed: 0, recancelled: 0 });
    expect(await status(overdue)).toBe('EXPIRED');
    expect(await status(fresh)).toBe('REQUESTED');
    expect((await trip(t.id)).seatsAvailable).toBe(3);
  });

  it('runTick completes trips after departure + duration; leaves future trips alone', async () => {
    const now = new Date();
    const past = await createTrip({ seatsTotal: 4, departureAt: new Date(now.getTime() + 3 * HOUR) });
    const timed = await createTrip({ departureAt: new Date(now.getTime() + 3 * HOUR) });
    await db.trip.update({ where: { id: timed.id }, data: { durationMin: 600 } }); // 10 h drive
    const future = await createTrip({ departureAt: new Date(now.getTime() + 3 * DAY) });

    const accepted = await book(past.id, 2, now);
    const leftover = await book(past.id, 1, now);
    await transition(accepted, 'ACCEPT', { userId: past.driverId, kind: 'DRIVER' }, now);
    const futureReq = await book(future.id, 1, now);

    // 3 h + 6 h (default duration) + 1 min later.
    const res = await runTick(new Date(now.getTime() + 9 * HOUR + 60_000));
    expect(res.completed).toBe(1);
    expect((await trip(past.id)).status).toBe('COMPLETED');
    expect(await status(accepted)).toBe('COMPLETED');
    expect(await status(leftover)).toBe('EXPIRED');
    expect((await trip(timed.id)).status).toBe('PUBLISHED');
    expect((await trip(future.id)).status).toBe('PUBLISHED');
    expect(await status(futureReq)).toBe('REQUESTED');
  });

  it('runTick is idempotent (second run changes nothing)', async () => {
    const now = new Date();
    const t = await createTrip({ departureAt: new Date(now.getTime() + 3 * HOUR) });
    const a = await book(t.id, 1, now);
    const r = await book(t.id, 1, now);
    await transition(a, 'ACCEPT', { userId: t.driverId, kind: 'DRIVER' }, now);
    const later = new Date(now.getTime() + 10 * HOUR);

    expect(await runTick(later)).toEqual({ expired: 1, completed: 1, recancelled: 0 });
    const snapshot = await db.booking.findMany({ orderBy: { id: 'asc' } });
    const tripSnapshot = await trip(t.id);

    expect(await runTick(later)).toEqual({ expired: 0, completed: 0, recancelled: 0 });
    expect(await db.booking.findMany({ orderBy: { id: 'asc' } })).toEqual(snapshot);
    expect(await trip(t.id)).toEqual(tripSnapshot);
    expect(await status(r)).toBe('EXPIRED');
  });

  it('processes more than one batch of 100', async () => {
    const now = new Date();
    const t = await createTrip({ seatsTotal: 7, departureAt: new Date(now.getTime() + 3 * DAY) });
    // 105 overdue requests across many trips (one active booking per passenger per trip).
    const passengers = await Promise.all(Array.from({ length: 105 }, () => createUser()));
    await db.booking.createMany({
      data: passengers.map((p) => ({
        tripId: t.id,
        passengerId: p.id,
        seats: 0,
        amount: 0,
        status: 'REQUESTED' as const,
        expiresAt: new Date(now.getTime() - HOUR),
      })),
    });
    expect(await runTick(now)).toEqual({ expired: 105, completed: 0, recancelled: 0 });
    expect(await db.booking.count({ where: { status: 'REQUESTED' } })).toBe(0);
  });

  it('re-cancels open bookings left on a CANCELLED trip with a full refund, idempotently', async () => {
    const now = new Date();
    const t = await createTrip({ seatsTotal: 4, departureAt: new Date(now.getTime() + 5 * HOUR) });
    const accepted = await book(t.id, 2, now);
    const requested = await book(t.id, 1, now);
    await transition(accepted, 'ACCEPT', { userId: t.driverId, kind: 'DRIVER' }, now);
    // Simulate a cascade that flipped the trip but failed to cancel its bookings.
    await db.trip.update({ where: { id: t.id }, data: { status: 'CANCELLED' } });

    expect(await runTick(now)).toEqual({ expired: 0, completed: 0, recancelled: 2 });
    const a = await db.booking.findUniqueOrThrow({ where: { id: accepted } });
    expect(a).toMatchObject({ status: 'CANCELLED', cancelledBy: 'DRIVER', refundAmount: a.amount });
    expect(await status(requested)).toBe('CANCELLED');
    expect((await trip(t.id)).seatsAvailable).toBe(4);

    expect(await runTick(now)).toEqual({ expired: 0, completed: 0, recancelled: 0 });
    expect((await trip(t.id)).seatsAvailable).toBe(4);
  });
});

describe('GET /api/cron/tick', () => {
  const call = (auth?: string) =>
    GET(new Request('http://localhost/api/cron/tick', { headers: auth ? { authorization: auth } : {} }));

  it('cron route returns 401 without the secret', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect((await call('Bearer test-cron-secret-but-longer')).status).toBe(401);
    expect((await call('test-cron-secret')).status).toBe(401);
  });

  it('returns 401 when CRON_SECRET is unset, even for an empty bearer token', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect((await call('Bearer undefined')).status).toBe(401);
  });

  it('runs the tick with the right secret', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    const res = await call('Bearer test-cron-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ expired: 0, completed: 0, recancelled: 0 });
  });
});
