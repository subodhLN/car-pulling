import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Rating } from '@/components/reviews/rating';
import { ReviewList } from '@/components/reviews/review-list';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatIst } from '@/lib/time';
import { getPublicProfile } from '@/modules/users/service';

type Props = { params: Promise<{ id: string }> };

const loadProfile = cache(getPublicProfile);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile((await params).id);
  return { title: profile ? `${profile.name ?? 'Member'} on RideShare` : 'Profile' };
}

const rides = (n: number) => `${n} ${n === 1 ? 'ride' : 'rides'}`;

export default async function ProfilePage({ params }: Props) {
  const profile = await loadProfile((await params).id);
  if (!profile) notFound();
  const name = profile.name ?? 'RideShare member';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <Avatar name={name} image={profile.image} size={96} />
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight break-words">{name}</h1>
          <p className="text-sm text-muted">Member since {formatIst(profile.memberSince, 'MMMM yyyy')}</p>
          {profile.emailVerified || profile.idVerified ? (
            <ul className="flex flex-wrap gap-2" aria-label="Verifications">
              {profile.emailVerified ? (
                <li>
                  <Badge tone="success">✓ Email verified</Badge>
                </li>
              ) : null}
              {profile.idVerified ? (
                <li>
                  <Badge tone="success">✓ ID verified</Badge>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: 'Rating', value: <Rating avg={profile.ratingAvg} count={profile.ratingCount} /> },
          { label: 'As driver', value: rides(profile.ridesAsDriver) },
          { label: 'As passenger', value: rides(profile.ridesAsPassenger) },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{s.label}</dt>
            <dd className="mt-1 text-lg font-bold">{s.value}</dd>
          </Card>
        ))}
      </dl>

      {profile.bio ? (
        <section aria-labelledby="about" className="space-y-2">
          <h2 id="about" className="text-xl font-bold">
            About
          </h2>
          <p className="break-words whitespace-pre-line">{profile.bio}</p>
        </section>
      ) : null}

      <section aria-labelledby="reviews" className="space-y-3">
        <h2 id="reviews" className="text-xl font-bold">
          Reviews
        </h2>
        <Card>
          <ReviewList reviews={profile.reviews} />
        </Card>
      </section>
    </div>
  );
}
