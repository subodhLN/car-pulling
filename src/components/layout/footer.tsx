import Link from 'next/link';

const LINKS = [
  { href: '/search', label: 'Find a ride' },
  { href: '/trips/new', label: 'Offer a ride' },
  { href: '/credits', label: 'Photo credits' },
] as const;

export function Footer() {
  return (
    <footer className="wrap">
      <div className="mt-[88px] flex flex-wrap gap-x-7 gap-y-3 border-t border-line pt-7 pb-10 text-sm text-muted">
        <span className="mr-auto text-base font-extrabold tracking-[-0.02em] text-fg">RideShare</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-7 gap-y-3">
          {LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-fg">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
