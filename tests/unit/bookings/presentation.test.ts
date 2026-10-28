import { describe, expect, it } from 'vitest';
import {
  isOpen,
  refundPreview,
  requestAvailability,
  showsTripCancelled,
  statusTone,
  STATUS_LABEL,
} from '@/modules/bookings/presentation';

const now = new Date('2026-11-01T00:00:00Z');
const hours = (h: number) => new Date(now.getTime() + h * 3600e3);

describe('refundPreview', () => {
  it('ACCEPTED more than 24 h out → full amount', () => {
    expect(refundPreview({ status: 'ACCEPTED', amount: 90000 }, hours(25), now)).toBe("You'll get ₹900 back");
  });
  it('ACCEPTED within 24 h → no refund copy', () => {
    expect(refundPreview({ status: 'ACCEPTED', amount: 90000 }, hours(24), now)).toBe(
      'No refund — less than 24 hours before departure',
    );
  });
  it('REQUESTED → null (nothing charged)', () => {
    expect(refundPreview({ status: 'REQUESTED', amount: 90000 }, hours(48), now)).toBeNull();
  });
});

describe('status display', () => {
  it('labels and tones', () => {
    expect(STATUS_LABEL.REQUESTED).toBe('Requested');
    expect(statusTone('REQUESTED')).toBe('warning');
    expect(statusTone('ACCEPTED')).toBe('success');
    expect(statusTone('COMPLETED')).toBe('neutral');
    expect(statusTone('CANCELLED')).toBe('neutral');
    expect(isOpen('ACCEPTED')).toBe(true);
    expect(isOpen('EXPIRED')).toBe(false);
  });
});

describe('showsTripCancelled', () => {
  const cancelled = 'CANCELLED' as const;
  it('open bookings on a cancelled trip show "Trip cancelled by the driver"', () => {
    for (const status of ['PENDING_PAYMENT', 'REQUESTED', 'ACCEPTED'] as const) {
      expect(showsTripCancelled({ status, cancelledBy: null }, cancelled)).toBe(true);
    }
  });
  it('bookings cancelled by the driver or an admin show it', () => {
    expect(showsTripCancelled({ status: 'CANCELLED', cancelledBy: 'DRIVER' }, cancelled)).toBe(true);
    expect(showsTripCancelled({ status: 'CANCELLED', cancelledBy: 'ADMIN' }, cancelled)).toBe(true);
  });
  it('rejected, expired and passenger-cancelled bookings keep their own badge', () => {
    expect(showsTripCancelled({ status: 'REJECTED', cancelledBy: null }, cancelled)).toBe(false);
    expect(showsTripCancelled({ status: 'EXPIRED', cancelledBy: null }, cancelled)).toBe(false);
    expect(showsTripCancelled({ status: 'CANCELLED', cancelledBy: 'PASSENGER' }, cancelled)).toBe(false);
  });
  it('never on a trip that is not cancelled', () => {
    expect(showsTripCancelled({ status: 'CANCELLED', cancelledBy: 'DRIVER' }, 'PUBLISHED')).toBe(false);
    expect(showsTripCancelled({ status: 'ACCEPTED', cancelledBy: null }, 'COMPLETED')).toBe(false);
  });
});

describe('requestAvailability', () => {
  const trip = {
    status: 'PUBLISHED' as const,
    seatsAvailable: 2,
    departureAt: hours(48),
    driver: { status: 'ACTIVE' as const },
  };
  it('open trip with seats → open', () => {
    expect(requestAvailability(trip, now)).toEqual({ open: true });
  });
  it('suspended driver → no longer available', () => {
    expect(requestAvailability({ ...trip, driver: { status: 'SUSPENDED' } }, now)).toEqual({
      open: false,
      message: 'This ride is no longer available',
    });
  });
  it('within 1 h of departure or not published → no longer taking requests', () => {
    expect(requestAvailability({ ...trip, departureAt: hours(1) }, now)).toEqual({
      open: false,
      message: 'This ride is no longer taking requests',
    });
    expect(requestAvailability({ ...trip, status: 'CANCELLED' }, now)).toEqual({
      open: false,
      message: 'This ride is no longer taking requests',
    });
  });
  it('no seats → full', () => {
    expect(requestAvailability({ ...trip, seatsAvailable: 0 }, now)).toEqual({ open: false, message: 'This ride is full' });
  });
});
