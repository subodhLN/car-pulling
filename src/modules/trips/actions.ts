'use server';

import { revalidatePath } from 'next/cache';
import { defineAction } from '@/lib/action';
import { requireTripDriver, requireUser } from '@/modules/auth/guards';
import { cancelTrip } from './cancel';
import { publishFormSchema, tripIdSchema } from './schemas';
import { publishTrip } from './service';

export const publishTripAction = defineAction(publishFormSchema, async (input) => {
  const user = await requireUser();
  const res = await publishTrip(user.id, input);
  if (res.ok) revalidatePath('/dashboard/trips');
  return res;
});

export const cancelTripAction = defineAction(tripIdSchema, async ({ tripId }) => {
  const { user } = await requireTripDriver(tripId);
  const res = await cancelTrip(tripId, { userId: user.id, kind: 'DRIVER' });
  if (res.ok) {
    revalidatePath(`/trips/${tripId}`);
    revalidatePath('/dashboard/trips');
    revalidatePath('/dashboard/bookings');
  }
  return res;
});
