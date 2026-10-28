import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { signIn } from '@/auth';
import { Button } from '@/components/ui/button';
import { DemoAccountsPanel } from './demo-accounts';
import { safeNext } from './schemas';

/** Centered card on a soft background shared by the login and signup pages. */
export function AuthShell({
  title,
  next,
  children,
}: {
  title: string;
  next?: string;
  children: ReactNode;
}) {
  const googleEnabled = !!process.env.AUTH_GOOGLE_ID;
  return (
    <div className="grid min-h-[70vh] place-items-center bg-soft px-4 py-12">
      <div className="w-full max-w-[420px]">
        <Card className="p-7">
          <h1 className="mb-6 text-2xl font-extrabold tracking-[-0.02em]">{title}</h1>
          {children}
          {googleEnabled ? (
            <form
              className="mt-4"
              action={async () => {
                'use server';
                await signIn('google', { redirectTo: safeNext(next) });
              }}
            >
              <Button type="submit" variant="ghost" size="lg" className="w-full">
                Continue with Google
              </Button>
            </form>
          ) : null}
        </Card>
        <DemoAccountsPanel />
      </div>
    </div>
  );
}
