import type { Trip } from '@prisma/client';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { findTripRow } from '@/modules/trips/service';

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

/** The signed-in, active user, or null (signed out or suspended) — for pages that render for everyone. */
export async function optionalUser(): Promise<SessionUser | null> {
  try {
    return await requireUser();
  } catch (e) {
    if (e instanceof AppError) return null;
    throw e;
  }
}

/**
 * The signed-in user, who must be the trip's driver. Callers of listTripBookings and trip-management
 * actions must pass this first. Throws UNAUTHENTICATED, NOT_FOUND or NOT_ALLOWED.
 */
export async function requireTripDriver(tripId: string): Promise<{ user: SessionUser; trip: Trip }> {
  const user = await requireUser();
  const trip = await findTripRow(tripId);
  if (!trip) throw new AppError('NOT_FOUND', 'Trip not found');
  if (trip.driverId !== user.id) throw new AppError('NOT_ALLOWED', 'Only the driver can manage this trip');
  return { user, trip };
}
