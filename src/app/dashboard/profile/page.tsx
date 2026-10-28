import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageUser } from '@/modules/auth/guards';
import { getEditableProfile } from '@/modules/users/service';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Your profile' };

export default async function EditProfilePage() {
  const user = await requirePageUser('/dashboard/profile');
  const profile = await getEditableProfile(user.id);
  return (
    <div className="space-y-6">
      <p className="text-muted">
        This is what co-travellers see.{' '}
        <Link href={`/users/${user.id}`} className="font-semibold text-fg underline underline-offset-2">
          View your public profile
        </Link>
      </p>
      <ProfileForm initial={{ name: profile?.name ?? '', bio: profile?.bio ?? '', phone: profile?.phone ?? '' }} />
    </div>
  );
}
