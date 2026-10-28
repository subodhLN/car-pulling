import { auth } from '@/auth';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';

export type SessionUser = { id: string; name: string; email: string; role: 'USER' | 'ADMIN' };

/** Current signed-in user, re-read from the database so suspension and role changes apply immediately. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new AppError('UNAUTHENTICATED', 'Please log in');
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new AppError('UNAUTHENTICATED', 'Please log in');
  if (user.status === 'SUSPENDED') throw new AppError('NOT_ALLOWED', 'Your account is suspended');
  return { id: user.id, name: user.name ?? '', email: user.email, role: user.role };
}
