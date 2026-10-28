import Link from 'next/link';
import { AuthArea } from './auth-area';
import { LogoMark } from './logo';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { href: '/search', label: 'Find a ride' },
  { href: '/trips/new', label: 'Offer a ride' },
] as const;

export function SiteHeader() {
  return (
    <header className="wrap">
      <nav aria-label="Main" className="flex items-center gap-7 py-[18px]">
        <Link
          href="/"
          className="flex items-center gap-2 text-[21px] font-extrabold tracking-[-0.02em]"
          aria-label="RideShare home"
        >
          <LogoMark />
          <span>RideShare</span>
        </Link>
        <div className="hidden gap-6 text-[15px] font-medium text-muted min-[761px]:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-fg">
              {item.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <ThemeToggle />
          <AuthArea />
        </div>
      </nav>
    </header>
  );
}
