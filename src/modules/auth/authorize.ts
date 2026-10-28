import { CredentialsSignin } from '@auth/core/errors';
import { clientIp } from '@/lib/client-ip';
import { rateLimit } from '@/lib/rate-limit';
import { loginSchema } from './schemas';
import { checkCredentials, type VerifiedUser } from './service';

export class RateLimitedSignin extends CredentialsSignin {
  code = 'rate_limited';
}
export class SuspendedSignin extends CredentialsSignin {
  code = 'suspended';
}

/**
 * Credentials `authorize` implementation. The login rate limit (auth:<ip>, 10/60 s) lives HERE and only
 * here for logins, so both the login form and a direct POST to /api/auth/callback/credentials are
 * covered, and each attempt is counted once. Failures are thrown as coded CredentialsSignin errors so
 * loginAction can map them to user copy.
 */
export async function authorizeCredentials(raw: unknown, headers: Headers): Promise<VerifiedUser | null> {
  if (!(await rateLimit(`auth:${clientIp(headers)}`, 10, 60))) throw new RateLimitedSignin();
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const res = await checkCredentials(parsed.data.email, parsed.data.password);
  if (res.status === 'SUSPENDED') throw new SuspendedSignin();
  return res.status === 'OK' ? res.user : null;
}
