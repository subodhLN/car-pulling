'use server';

import { revalidatePath } from 'next/cache';
import { defineAction } from '@/lib/action';
import { ok } from '@/lib/result';
import { requireUser } from '@/modules/auth/guards';
import { deleteVehicleSchema, vehicleSchema } from './schemas';
import { createVehicle, deleteVehicle } from './service';

export const addVehicleAction = defineAction(vehicleSchema, async (input) => {
  const user = await requireUser();
  const vehicle = await createVehicle(user.id, input);
  revalidatePath('/dashboard/vehicles');
  return ok({ id: vehicle.id });
});

export const deleteVehicleAction = defineAction(deleteVehicleSchema, async ({ vehicleId }) => {
  const user = await requireUser();
  const res = await deleteVehicle(user.id, vehicleId);
  if (res.ok) revalidatePath('/dashboard/vehicles');
  return res;
});
