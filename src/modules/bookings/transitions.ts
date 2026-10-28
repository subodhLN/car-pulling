// Pure booking state machine and policy rules. No database or framework imports.

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'ABANDONED'
  | 'CANCELLED'
  | 'COMPLETED';

export type BookingEvent = 'AUTHORIZE' | 'ABANDON' | 'ACCEPT' | 'REJECT' | 'EXPIRE' | 'CANCEL' | 'COMPLETE';

export type ActorKind = 'PASSENGER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';

const TRANSITIONS: Partial<Record<BookingStatus, Partial<Record<BookingEvent, BookingStatus>>>> = {
  PENDING_PAYMENT: { AUTHORIZE: 'REQUESTED', ABANDON: 'ABANDONED', CANCEL: 'CANCELLED' },
  REQUESTED: { ACCEPT: 'ACCEPTED', REJECT: 'REJECTED', EXPIRE: 'EXPIRED', CANCEL: 'CANCELLED' },
  ACCEPTED: { CANCEL: 'CANCELLED', COMPLETE: 'COMPLETED' },
};

const ACTORS: Record<BookingEvent, readonly ActorKind[]> = {
  ACCEPT: ['DRIVER', 'ADMIN'],
  REJECT: ['DRIVER', 'ADMIN'],
  CANCEL: ['PASSENGER', 'DRIVER', 'ADMIN'],
  AUTHORIZE: ['SYSTEM'],
  ABANDON: ['SYSTEM'],
  EXPIRE: ['SYSTEM'],
  COMPLETE: ['SYSTEM'],
};

const SEAT_RETURNING: ReadonlySet<BookingStatus> = new Set(['ABANDONED', 'REJECTED', 'EXPIRED', 'CANCELLED']);

const DAY_MS = 24 * 3600e3;
const REQUEST_WINDOW_MS = 24 * 3600e3;

/** Next status for an event, or null when the event is not allowed from `from`. */
export function nextStatus(from: BookingStatus, event: BookingEvent): BookingStatus | null {
  return TRANSITIONS[from]?.[event] ?? null;
}

export function allowedActor(event: BookingEvent, actor: ActorKind): boolean {
  return ACTORS[event].includes(actor);
}

export function returnsSeats(to: BookingStatus): boolean {
  return SEAT_RETURNING.has(to);
}

/**
 * Refund owed when cancelling. `b.status` is the status BEFORE cancelling.
 * - ACCEPTED + PASSENGER: full amount only if departure is strictly more than 24h away.
 * - ACCEPTED + DRIVER or ADMIN: full amount.
 * - Any other status, or the SYSTEM actor: 0.
 */
export function refundAmount(
  b: { status: BookingStatus; amount: number },
  departureAt: Date,
  now: Date,
  actor: ActorKind,
): number {
  if (b.status !== 'ACCEPTED') return 0;
  if (actor === 'DRIVER' || actor === 'ADMIN') return b.amount;
  if (actor === 'PASSENGER') return departureAt.getTime() - now.getTime() > DAY_MS ? b.amount : 0;
  return 0;
}

/** Request expiry: earlier of requestedAt + 24h and departureAt. Always returns a new Date. */
export function computeExpiresAt(requestedAt: Date, departureAt: Date): Date {
  const windowEnd = requestedAt.getTime() + REQUEST_WINDOW_MS;
  return new Date(Math.min(windowEnd, departureAt.getTime()));
}
