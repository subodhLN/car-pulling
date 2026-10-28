'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type DemoAccount = { label: string; email: string; password: string };

/** Shared by every seeded demo account (prisma/seed.ts). Public by design: demo data only. */
export const DEMO_PASSWORD = 'demo-ride-2026';

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { label: 'Driver', email: 'driver@demo.test', password: DEMO_PASSWORD },
  { label: 'Passenger', email: 'passenger@demo.test', password: DEMO_PASSWORD },
  { label: 'Admin', email: 'admin@demo.test', password: DEMO_PASSWORD },
];

/** The login form's inputs are uncontrolled, so the panel fills them directly by id. */
function fill(account: DemoAccount) {
  for (const [id, value] of [
    ['email', account.email],
    ['password', account.password],
  ] as const) {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement) input.value = value;
  }
}

export function DemoAccountsPanel({ accounts = DEMO_ACCOUNTS }: { accounts?: readonly DemoAccount[] }) {
  if (process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === 'false' || accounts.length === 0) return null;
  return (
    <Card className="mt-4 bg-soft text-sm">
      <h2 className="mb-2 font-bold">Demo accounts</h2>
      <ul className="space-y-2">
        {accounts.map((a) => (
          <li key={a.email} className="flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold">{a.label}</span>{' '}
              <span className="text-muted">{a.email}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => fill(a)}
              aria-label={`Use ${a.label.toLowerCase()} demo account`}
            >
              Use
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-muted">Demo password: {accounts[0].password}</p>
    </Card>
  );
}
