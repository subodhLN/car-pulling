import { z } from 'zod';
import { phoneField } from '@/modules/auth/schemas';

export const MAX_BIO = 280;

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80, 'Name is too long'),
  bio: z
    .string()
    .trim()
    .max(MAX_BIO, `Keep your bio under ${MAX_BIO} characters`)
    .optional()
    .transform((b) => b || undefined),
  phone: phoneField,
});

export type ProfileInput = z.input<typeof profileSchema>;
