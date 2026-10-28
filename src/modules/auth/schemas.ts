import { z } from 'zod';

export const PHONE_ERROR = 'Enter a 10-digit Indian mobile number';

/** "+91 98765-43210" / "09876543210" / "9876543210" → "+919876543210"; null if not an Indian mobile. */
export function normalizeIndianPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s-]/g, '');
  const m = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return m ? `+91${m[1]}` : null;
}

const phoneField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v.trim() === '') return undefined;
    const normalized = normalizeIndianPhone(v);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: PHONE_ERROR });
      return z.NEVER;
    }
    return normalized;
  });

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80, 'Name is too long'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200, 'Password is too long'),
  phone: phoneField,
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password'),
});

/** Only same-site relative paths are allowed as a post-login destination. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}
