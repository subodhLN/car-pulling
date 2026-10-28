'use server';

import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { signIn } from '@/auth';
import { defineAction } from '@/lib/action';
import { rateLimit } from '@/lib/rate-limit';
import { err, ok, type Result } from '@/lib/result';
import { loginSchema, signUpSchema } from './schemas';
import { checkCredentials, signUp } from './service';

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

async function limited(): Promise<boolean> {
  return !(await rateLimit(`auth:${await clientIp()}`, 10, 60));
}

const RATE_LIMITED_MSG = 'Too many attempts. Wait a minute and try again.';
const INVALID_MSG = 'Email or password is incorrect.';

async function startSession(email: string, password: string): Promise<Result<null>> {
  try {
    await signIn('credentials', { email, password, redirect: false });
    return ok(null);
  } catch (e) {
    if (e instanceof AuthError) return err('VALIDATION', INVALID_MSG);
    throw e;
  }
}

export const signUpAction = defineAction(signUpSchema, async (input) => {
  if (await limited()) return err('RATE_LIMITED', RATE_LIMITED_MSG);
  const created = await signUp(input);
  if (!created.ok) return created;
  const session = await startSession(input.email, input.password);
  if (!session.ok) return session;
  return ok({ id: created.data.id });
});

export const loginAction = defineAction(loginSchema, async ({ email, password }) => {
  if (await limited()) return err('RATE_LIMITED', RATE_LIMITED_MSG);
  const check = await checkCredentials(email, password);
  if (check.status === 'SUSPENDED') return err('NOT_ALLOWED', 'Your account is suspended.');
  if (check.status === 'INVALID') return err('VALIDATION', INVALID_MSG);
  const session = await startSession(email, password);
  if (!session.ok) return session;
  return ok({ id: check.user.id });
});
