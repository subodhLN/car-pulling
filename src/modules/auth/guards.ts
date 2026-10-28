import { redirect } from 'next/navigation';
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

/** For server-component pages: sends signed-out visitors to /login and brings them back to `nextPath`. */
export async function requirePageUser(nextPath: string): Promise<SessionUser> {
  try {
    return await requireUser();
  } catch (e) {
    if (e instanceof AppError && e.code === 'UNAUTHENTICATED') {
      redirect('/login?next=' + encodeURIComponent(nextPath));
    }
    throw e;
  }
}
