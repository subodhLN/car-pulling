import { z } from 'zod';

export const vehicleSchema = z.object({
  make: z.string().trim().min(1, 'Enter the make').max(40, 'Make is too long (40 characters max)'),
  model: z.string().trim().min(1, 'Enter the model').max(40, 'Model is too long (40 characters max)'),
  color: z.string().trim().min(1, 'Enter the colour').max(20, 'Colour is too long (20 characters max)'),
  // Form values arrive as strings; passenger seats exclude the driver.
  seats: z.coerce
    .number({ error: 'Choose the number of passenger seats' })
    .int('Seats must be a whole number')
    .min(1, 'A car needs at least 1 passenger seat')
    .max(7, 'A car can have at most 7 passenger seats'),
});
export type VehicleInput = z.input<typeof vehicleSchema>;

export const deleteVehicleSchema = z.object({ vehicleId: z.string().min(1) });
