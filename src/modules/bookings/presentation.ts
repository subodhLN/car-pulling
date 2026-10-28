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

type TripStatus = 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

/**
 * Whether a passenger's booking card shows "Trip cancelled by the driver" instead of its status badge:
 * only when the trip is cancelled and the booking was cancelled by the driver/admin (the cascade) or is
 * still open (a cascade that has not finished yet; the cron tick cancels it). Rejected, expired and
 * passenger-cancelled bookings keep their own badge.
 */
export function showsTripCancelled(
  b: { status: BookingStatus; cancelledBy: 'PASSENGER' | 'DRIVER' | 'ADMIN' | null },
  tripStatus: TripStatus,
): boolean {
  if (tripStatus !== 'CANCELLED') return false;
  if (isOpen(b.status)) return true;
  return b.status === 'CANCELLED' && (b.cancelledBy === 'DRIVER' || b.cancelledBy === 'ADMIN');
}

/** Requests close this long before departure (requestBooking enforces the same rule). */
const REQUEST_CUTOFF_MS = 60 * 60 * 1000;

/** Whether a viewer without a booking can request seats on a trip, and the copy to show when not. */
export function requestAvailability(
  trip: {
    status: TripStatus;
    seatsAvailable: number;
    departureAt: Date;
    driver: { status: 'ACTIVE' | 'SUSPENDED' };
  },
  now: Date,
): { open: true } | { open: false; message: string } {
  if (trip.driver.status !== 'ACTIVE') return { open: false, message: 'This ride is no longer available' };
  if (trip.status !== 'PUBLISHED' || trip.departureAt.getTime() <= now.getTime() + REQUEST_CUTOFF_MS) {
    return { open: false, message: 'This ride is no longer taking requests' };
  }
  if (trip.seatsAvailable === 0) return { open: false, message: 'This ride is full' };
  return { open: true };
}
