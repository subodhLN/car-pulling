'use server';

import { revalidatePath } from 'next/cache';
import { defineAction } from '@/lib/action';
import { rateLimit } from '@/lib/rate-limit';
import { err, type Result } from '@/lib/result';
import { requireUser } from '@/modules/auth/guards';
import { bookingIdSchema, requestBookingSchema } from './schemas';
import { actorFor, requestBooking, transition } from './service';
import type { BookingEvent } from './transitions';

function revalidateBookingPages(tripId: string): void {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath('/dashboard/trips');
  revalidatePath('/dashboard/bookings');
}

export const requestBookingAction = defineAction(requestBookingSchema, async ({ tripId, seats }) => {
  const user = await requireUser();
  if (!(await rateLimit(`book:${user.id}`, 10, 3600))) {
    return err('RATE_LIMITED', "You've made too many booking requests. Try again later.");
  }
  const res = await requestBooking(user.id, tripId, seats);
  if (res.ok) revalidateBookingPages(tripId);
  return res;
});

async function runTransition(
  bookingId: string,
  event: BookingEvent,
): Promise<Result<{ status: string; refundAmount: number }>> {
  const user = await requireUser();
  const actor = await actorFor(bookingId, user);
  const res = await transition(bookingId, event, actor);
  if (!res.ok) return res;
  revalidateBookingPages(res.data.tripId);
  return { ok: true, data: { status: res.data.status, refundAmount: res.data.refundAmount } };
}

export const acceptBookingAction = defineAction(bookingIdSchema, ({ bookingId }) => runTransition(bookingId, 'ACCEPT'));
export const rejectBookingAction = defineAction(bookingIdSchema, ({ bookingId }) => runTransition(bookingId, 'REJECT'));
export const cancelBookingAction = defineAction(bookingIdSchema, ({ bookingId }) => runTransition(bookingId, 'CANCEL'));
