'use server';

import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { signIn } from '@/auth';
import { defineAction } from '@/lib/action';
import { clientIp } from '@/lib/client-ip';
import { rateLimit } from '@/lib/rate-limit';
import { err, ok, type Result } from '@/lib/result';
import { loginSchema, signUpSchema } from './schemas';
import { signUp } from './service';

const RATE_LIMITED_MSG = 'Too many attempts. Wait a minute and try again.';
const INVALID_MSG = 'Email or password is incorrect.';

async function startSession(email: string, password: string): Promise<Result<null> & { code?: string }> {
  try {
    await signIn('credentials', { email, password, redirect: false });
    return ok(null);
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code;
      if (code === 'rate_limited') return err('RATE_LIMITED', RATE_LIMITED_MSG);
      if (code === 'suspended') return err('NOT_ALLOWED', 'Your account is suspended.');
      return err('VALIDATION', INVALID_MSG);
    }
    throw e;
  }
}

/** Logins are rate limited inside the credentials `authorize` (see authorize.ts); not repeated here. */
export const loginAction = defineAction(loginSchema, async ({ email, password }) => {
  const res = await startSession(email, password);
  return res.ok ? ok({ ok: true as const }) : res;
});

/**
 * Sign-ups are limited here (auth:<ip> 10/60 s). The automatic sign-in that follows passes through
 * `authorize`, which counts once more, so one sign-up consumes two slots of the shared window.
 */
export const signUpAction = defineAction(signUpSchema, async (input) => {
  const ip = clientIp(await headers());
  if (!(await rateLimit(`auth:${ip}`, 10, 60))) return err('RATE_LIMITED', RATE_LIMITED_MSG);
  const created = await signUp(input);
  if (!created.ok) return created;
  const session = await startSession(input.email, input.password);
  if (!session.ok) return err('INVALID_STATE', 'Account created. Please log in.');
  return ok({ id: created.data.id });
});
