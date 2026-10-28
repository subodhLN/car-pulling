import { z } from 'zod';

export const requestBookingSchema = z.object({
  tripId: z.string().min(1, 'Trip not found'),
  // Form values arrive as strings.
  seats: z.coerce
    .number({ error: 'Choose how many seats you need' })
    .int('Seats must be a whole number')
    .min(1, 'Request at least 1 seat')
    .max(4, 'You can request at most 4 seats'),
});
export type RequestBookingInput = z.input<typeof requestBookingSchema>;

export const bookingIdSchema = z.object({ bookingId: z.string().min(1) });
