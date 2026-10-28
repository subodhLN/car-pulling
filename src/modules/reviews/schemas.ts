import { z } from 'zod';

export const MAX_COMMENT = 500;

export const reviewInputSchema = z.object({
  tripId: z.string().min(1),
  subjectId: z.string().min(1),
  rating: z
    .number({ error: 'Choose a rating from 1 to 5 stars' })
    .int('Choose a rating from 1 to 5 stars')
    .min(1, 'Choose a rating from 1 to 5 stars')
    .max(5, 'Choose a rating from 1 to 5 stars'),
  comment: z
    .string()
    .trim()
    .max(MAX_COMMENT, `Keep your comment under ${MAX_COMMENT} characters`)
    .optional()
    .transform((c) => c || undefined),
});

export type ReviewInput = z.input<typeof reviewInputSchema>;
