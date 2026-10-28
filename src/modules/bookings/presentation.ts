// Display helpers for bookings shared by the trip page and dashboards. Pure; no database access.
import type { BadgeTone } from '@/components/ui/badge';
import { formatInr } from '@/lib/money';
import { refundAmount, type BookingStatus } from './transitions';

export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  REQUESTED: 'Requested',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  ABANDONED: 'Abandoned',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export function statusTone(status: BookingStatus): BadgeTone {
  if (status === 'REQUESTED') return 'warning';
  if (status === 'ACCEPTED') return 'success';
  return 'neutral';
}

/** Statuses a passenger can still cancel from. */
export function isOpen(status: BookingStatus): boolean {
  return status === 'PENDING_PAYMENT' || status === 'REQUESTED' || status === 'ACCEPTED';
}

/**
 * What a passenger gets back if they cancel now, as the confirm-step copy. Uses the same refundAmount
 * rule transition() applies, so the preview matches the outcome. Null when nothing has been charged.
 */
export function refundPreview(
  b: { status: BookingStatus; amount: number },
  departureAt: Date,
  now: Date,
): string | null {
  if (b.status !== 'ACCEPTED') return null;
  const refund = refundAmount(b, departureAt, now, 'PASSENGER');
  return refund > 0 ? `You'll get ${formatInr(refund)} back` : 'No refund — less than 24 hours before departure';
}
