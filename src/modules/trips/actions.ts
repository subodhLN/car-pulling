'use server';

import { revalidatePath } from 'next/cache';
import { defineAction } from '@/lib/action';
import { requireUser } from '@/modules/auth/guards';
import { publishFormSchema } from './schemas';
import { publishTrip } from './service';

export const publishTripAction = defineAction(publishFormSchema, async (input) => {
  const user = await requireUser();
  const res = await publishTrip(user.id, input);
  if (res.ok) revalidatePath('/dashboard/trips');
  return res;
});
