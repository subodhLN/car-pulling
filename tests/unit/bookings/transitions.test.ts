import { describe, expect, expectTypeOf, it } from 'vitest';
import type { BookingStatus as PrismaBookingStatus } from '@prisma/client';
import {
  allowedActor,
  computeExpiresAt,
  nextStatus,
  refundAmount,
  returnsSeats,
  type ActorKind,
  type BookingEvent,
  type BookingStatus,
} from '@/modules/bookings/transitions';

const STATUSES: BookingStatus[] = [
  'PENDING_PAYMENT',
  'REQUESTED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'ABANDONED',
  'CANCELLED',
  'COMPLETED',
];
const EVENTS: BookingEvent[] = ['AUTHORIZE', 'ABANDON', 'ACCEPT', 'REJECT', 'EXPIRE', 'CANCEL', 'COMPLETE'];
const ACTORS: ActorKind[] = ['PASSENGER', 'DRIVER', 'ADMIN', 'SYSTEM'];

const H = 3600e3;
const MIN = 60e3;

describe('booking status type', () => {
  it('matches the Prisma BookingStatus enum exactly', () => {
    expectTypeOf<BookingStatus>().toEqualTypeOf<`${PrismaBookingStatus}`>();
  });
});

// Expected next status for every (from, event) pair; null means the event is not allowed from that status.
const EXPECTED: Record<BookingStatus, Record<BookingEvent, BookingStatus | null>> = {
  PENDING_PAYMENT: {
    AUTHORIZE: 'REQUESTED',
    ABANDON: 'ABANDONED',
    ACCEPT: null,
    REJECT: null,
    EXPIRE: null,
    CANCEL: 'CANCELLED',
    COMPLETE: null,
  },
  REQUESTED: {
    AUTHORIZE: null,
    ABANDON: null,
    ACCEPT: 'ACCEPTED',
    REJECT: 'REJECTED',
    EXPIRE: 'EXPIRED',
    CANCEL: 'CANCELLED',
    COMPLETE: null,
  },
  ACCEPTED: {
    AUTHORIZE: null,
    ABANDON: null,
    ACCEPT: null,
    REJECT: null,
    EXPIRE: null,
    CANCEL: 'CANCELLED',
    COMPLETE: 'COMPLETED',
  },
  REJECTED: {
    AUTHORIZE: null,
    ABANDON: null,
    ACCEPT: null,
    REJECT: null,
    EXPIRE: null,
    CANCEL: null,
    COMPLETE: null,
  },
  EXPIRED: {
    AUTHORIZE: null,
    ABANDON: null,
    ACCEPT: null,
    REJECT: null,
    EXPIRE: null,
    CANCEL: null,
    COMPLETE: null,
  },
  ABANDONED: {
    AUTHORIZE: null,
    ABANDON: null,
    ACCEPT: null,
    REJECT: null,
    EXPIRE: null,
    CANCEL: null,
    COMPLETE: null,
  },
  CANCELLED: {
    AUTHORIZE: null,
    ABANDON: null,
    ACCEPT: null,
    REJECT: null,
    EXPIRE: null,
    CANCEL: null,
    COMPLETE: null,
  },
  COMPLETED: {
    AUTHORIZE: null,
    ABANDON: null,
    ACCEPT: null,
    REJECT: null,
    EXPIRE: null,
    CANCEL: null,
    COMPLETE: null,
  },
};

describe('nextStatus', () => {
  it('covers all 8 x 7 status/event pairs', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...STATUSES].sort());
    for (const s of STATUSES) expect(Object.keys(EXPECTED[s]).sort()).toEqual([...EVENTS].sort());
  });

  const cases = STATUSES.flatMap((from) => EVENTS.map((event) => [from, event, EXPECTED[from][event]] as const));
  it.each(cases)('%s + %s -> %s', (from, event, expected) => {
    expect(nextStatus(from, event)).toBe(expected);
  });
});

describe('allowedActor', () => {
  const ALLOWED: Record<BookingEvent, ActorKind[]> = {
    AUTHORIZE: ['SYSTEM'],
    ABANDON: ['SYSTEM'],
    ACCEPT: ['DRIVER', 'ADMIN'],
    REJECT: ['DRIVER', 'ADMIN'],
    EXPIRE: ['SYSTEM'],
    CANCEL: ['PASSENGER', 'DRIVER', 'ADMIN'],
    COMPLETE: ['SYSTEM'],
  };

  const cases = EVENTS.flatMap((event) => ACTORS.map((actor) => [event, actor, ALLOWED[event].includes(actor)] as const));
  it.each(cases)('%s by %s -> %s', (event, actor, expected) => {
    expect(allowedActor(event, actor)).toBe(expected);
  });
});

describe('returnsSeats', () => {
  it.each(STATUSES.map((s) => [s, ['ABANDONED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(s)] as const))(
    '%s -> %s',
    (status, expected) => {
      expect(returnsSeats(status)).toBe(expected);
    },
  );
});

describe('refundAmount', () => {
  const dep = new Date('2026-11-10T03:30:00Z');
  const before = (ms: number) => new Date(dep.getTime() - ms);

  it('full refund when passenger cancels 24h + 1 min before', () =>
    expect(refundAmount({ status: 'ACCEPTED', amount: 90000 }, dep, before(24 * H + MIN), 'PASSENGER')).toBe(90000));
  it('no refund at exactly 24h before', () =>
    expect(refundAmount({ status: 'ACCEPTED', amount: 90000 }, dep, before(24 * H), 'PASSENGER')).toBe(0));
  it('no refund when passenger cancels 23h before', () =>
    expect(refundAmount({ status: 'ACCEPTED', amount: 90000 }, dep, before(23 * H), 'PASSENGER')).toBe(0));
  it('driver cancel always refunds in full, even inside 24h', () =>
    expect(refundAmount({ status: 'ACCEPTED', amount: 90000 }, dep, before(1 * H), 'DRIVER')).toBe(90000));
  it('admin cancel refunds in full, even inside 24h', () =>
    expect(refundAmount({ status: 'ACCEPTED', amount: 90000 }, dep, before(1 * H), 'ADMIN')).toBe(90000));
  it('nothing to refund for REQUESTED', () =>
    expect(refundAmount({ status: 'REQUESTED', amount: 90000 }, dep, before(48 * H), 'DRIVER')).toBe(0));
  it('nothing to refund for PENDING_PAYMENT', () =>
    expect(refundAmount({ status: 'PENDING_PAYMENT', amount: 90000 }, dep, before(48 * H), 'PASSENGER')).toBe(0));
  it('nothing to refund for COMPLETED', () =>
    expect(refundAmount({ status: 'COMPLETED', amount: 90000 }, dep, before(48 * H), 'ADMIN')).toBe(0));
  it('system actor never refunds', () =>
    expect(refundAmount({ status: 'ACCEPTED', amount: 90000 }, dep, before(48 * H), 'SYSTEM')).toBe(0));

  const nonAccepted: BookingStatus[] = STATUSES.filter((s) => s !== 'ACCEPTED');
  it.each(nonAccepted)('%s never refunds for any actor', (status) => {
    for (const actor of ACTORS) {
      expect(refundAmount({ status, amount: 90000 }, dep, before(48 * H), actor)).toBe(0);
    }
  });
});

describe('computeExpiresAt', () => {
  it('is requestedAt + 24h when departure is further away', () => {
    const requestedAt = new Date('2026-11-01T00:00:00Z');
    const departureAt = new Date('2026-11-10T03:30:00Z');
    expect(computeExpiresAt(requestedAt, departureAt).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('is departure when departure is sooner than 24h', () => {
    const requestedAt = new Date('2026-11-01T00:00:00Z');
    const departureAt = new Date('2026-11-01T10:00:00Z');
    expect(computeExpiresAt(requestedAt, departureAt).toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('is departure when departure is exactly 24h after requestedAt', () => {
    const requestedAt = new Date('2026-11-01T00:00:00Z');
    const departureAt = new Date('2026-11-02T00:00:00Z');
    expect(computeExpiresAt(requestedAt, departureAt).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('returns a new Date and does not mutate its inputs', () => {
    const requestedAt = new Date('2026-11-01T00:00:00Z');
    const departureAt = new Date('2026-11-10T03:30:00Z');
    const result = computeExpiresAt(requestedAt, departureAt);
    expect(result).not.toBe(requestedAt);
    expect(result).not.toBe(departureAt);
    expect(requestedAt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(departureAt.toISOString()).toBe('2026-11-10T03:30:00.000Z');
  });
});
