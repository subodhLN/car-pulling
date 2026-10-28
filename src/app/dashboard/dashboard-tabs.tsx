'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/dashboard/trips', label: 'My trips' },
  { href: '/dashboard/bookings', label: 'My bookings' },
  { href: '/dashboard/vehicles', label: 'Cars' },
];

export function DashboardTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[15px] font-semibold transition-colors',
              active ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
