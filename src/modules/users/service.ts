import { db } from '@/lib/db';
import { err, ok, type Result } from '@/lib/result';
import { listReviewsFor, type ReviewListItem } from '@/modules/reviews/service';
import { profileSchema, type ProfileInput } from './schemas';

export type PublicProfile = {
  id: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  memberSince: Date;
  ratingAvg: number;
  ratingCount: number;
  emailVerified: boolean;
  idVerified: boolean;
  ridesAsDriver: number;
  ridesAsPassenger: number;
  reviews: ReviewListItem[];
};

/** What anyone may see about a user. Never contact details; null for unknown or suspended users. */
export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const user = await db.user.findFirst({
    where: { id: userId, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      image: true,
      bio: true,
      createdAt: true,
      ratingAvg: true,
      ratingCount: true,
      emailVerified: true,
      idVerified: true,
    },
  });
  if (!user) return null;
  const [ridesAsDriver, ridesAsPassenger, reviews] = await Promise.all([
    db.trip.count({
      // A completed trip nobody rode on is not a ride.
      where: { driverId: userId, status: 'COMPLETED', bookings: { some: { status: 'COMPLETED' } } },
    }),
    db.booking.count({ where: { passengerId: userId, status: 'COMPLETED' } }),
    listReviewsFor(userId),
  ]);
  return {
    id: user.id,
    name: user.name,
    image: user.image,
    bio: user.bio,
    memberSince: user.createdAt,
    ratingAvg: Number(user.ratingAvg),
    ratingCount: user.ratingCount,
    emailVerified: user.emailVerified !== null,
    idVerified: user.idVerified,
    ridesAsDriver,
    ridesAsPassenger,
    reviews,
  };
}

/** The signed-in user's own editable details, for the profile form. */
export async function getEditableProfile(userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { name: true, bio: true, phone: true } });
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<Result<void>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION', parsed.error.issues[0]?.message ?? 'Check your details');
  const { name, bio, phone } = parsed.data;
  await db.user.update({ where: { id: userId }, data: { name, bio: bio ?? null, phone: phone ?? null } });
  return ok(undefined);
}
