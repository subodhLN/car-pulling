import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AuthForm } from '@/modules/auth/auth-form';
import { AuthShell } from '@/modules/auth/auth-shell';
import { safeNext } from '@/modules/auth/schemas';

export const metadata: Metadata = { title: 'Sign up' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if ((await auth())?.user) redirect(safeNext(next));
  return (
    <AuthShell title="Create your account" next={next}>
      <AuthForm mode="signup" next={next} />
    </AuthShell>
  );
}
