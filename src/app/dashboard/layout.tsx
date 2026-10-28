import { redirect } from 'next/navigation';
import { AppError } from '@/lib/errors';
import { requireUser } from '@/modules/auth/guards';
import { DashboardTabs } from './dashboard-tabs';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof AppError && e.code === 'UNAUTHENTICATED') redirect('/login');
    throw e;
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">Your dashboard</h1>
      <DashboardTabs />
      <div className="pt-6">{children}</div>
    </div>
  );
}
