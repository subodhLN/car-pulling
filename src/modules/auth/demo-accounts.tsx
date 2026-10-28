import { Card } from '@/components/ui/card';

export type DemoAccount = { label: string; email: string; password: string };

/** Task 12 fills this list with seeded demo logins; until then the panel renders nothing. */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [];

export function DemoAccountsPanel({ accounts = DEMO_ACCOUNTS }: { accounts?: readonly DemoAccount[] }) {
  if (accounts.length === 0) return null;
  return (
    <Card className="mt-4 bg-soft text-sm">
      <h2 className="mb-2 font-bold">Demo accounts</h2>
      <ul className="space-y-1.5">
        {accounts.map((a) => (
          <li key={a.email}>
            <span className="font-semibold">{a.label}</span>{' '}
            <span className="text-muted">
              {a.email} / {a.password}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
