import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AuthForm } from '@/modules/auth/auth-form';
import { AuthShell } from '@/modules/auth/auth-shell';
import { safeNext } from '@/modules/auth/schemas';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if ((await auth())?.user) redirect(safeNext(next));
  return (
    <AuthShell title="Log in" next={next}>
      <AuthForm mode="login" next={next} />
    </AuthShell>
  );
}
