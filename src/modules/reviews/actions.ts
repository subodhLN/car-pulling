'use server';

import { revalidatePath } from 'next/cache';
import { defineAction } from '@/lib/action';
import { rateLimit } from '@/lib/rate-limit';
import { err } from '@/lib/result';
import { requireUser } from '@/modules/auth/guards';
import { reviewInputSchema } from './schemas';
import { postReview } from './service';

export const postReviewAction = defineAction(reviewInputSchema, async (input) => {
  const user = await requireUser();
  if (!(await rateLimit(`review:${user.id}`, 10, 3600))) {
    return err('RATE_LIMITED', "You've posted a lot of reviews. Try again later.");
  }
  const res = await postReview(user.id, input);
  if (res.ok) {
    revalidatePath('/dashboard/bookings');
    revalidatePath('/dashboard/trips');
    revalidatePath(`/users/${input.subjectId}`);
  }
  return res;
});
