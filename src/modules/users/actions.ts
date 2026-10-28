'use server';

import { revalidatePath } from 'next/cache';
import { defineAction } from '@/lib/action';
import { requireUser } from '@/modules/auth/guards';
import { profileSchema } from './schemas';
import { updateProfile } from './service';

/** Edits the signed-in user's own profile; there is deliberately no userId input. */
export const updateProfileAction = defineAction(profileSchema, async (input) => {
  const user = await requireUser();
  const res = await updateProfile(user.id, input);
  if (res.ok) {
    revalidatePath(`/users/${user.id}`);
    revalidatePath('/dashboard/profile');
  }
  return res;
});
