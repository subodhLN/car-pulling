import { describe, expect, it } from 'vitest';
import { isOpen, refundPreview, statusTone, STATUS_LABEL } from '@/modules/bookings/presentation';

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
