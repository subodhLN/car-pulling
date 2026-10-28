import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { db } from '@/lib/db';
import { err, ok, type Result } from '@/lib/result';
import { signUpSchema, type SignUpInput } from './schemas';

const BCRYPT_COST = 10;

export type VerifiedUser = { id: string; name: string; email: string; role: Role };
export type CredentialCheck =
  | { status: 'OK'; user: VerifiedUser }
  | { status: 'INVALID' }
  | { status: 'SUSPENDED' };

export async function signUp(input: SignUpInput): Promise<Result<{ id: string }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid input');
  const { name, email, password, phone } = parsed.data;

  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    return err('VALIDATION', 'An account with this email already exists');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    const user = await db.user.create({
      data: { name, email, passwordHash, phone },
      select: { id: true },
    });
    return ok({ id: user.id });
  } catch (e) {
    // Lost a race with a concurrent sign-up for the same email (unique violation).
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
      return err('VALIDATION', 'An account with this email already exists');
    }
    throw e;
  }
}

/** Distinguishes a suspended account (only after the right password) from wrong credentials. */
export async function checkCredentials(email: string, password: string): Promise<CredentialCheck> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user?.passwordHash) return { status: 'INVALID' };
  if (!(await bcrypt.compare(password, user.passwordHash))) return { status: 'INVALID' };
  if (user.status === 'SUSPENDED') return { status: 'SUSPENDED' };
  return {
    status: 'OK',
    user: { id: user.id, name: user.name ?? '', email: user.email, role: user.role },
  };
}

export async function verifyCredentials(email: string, password: string): Promise<VerifiedUser | null> {
  const res = await checkCredentials(email, password);
  return res.status === 'OK' ? res.user : null;
}
