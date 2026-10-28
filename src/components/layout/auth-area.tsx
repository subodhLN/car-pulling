import Link from 'next/link';
import { auth } from '@/auth';
import { Avatar } from '@/components/ui/avatar';
import { ButtonLink } from '@/components/ui/button';
import { db } from '@/lib/db';
import { SignOutButton } from './signout-button';

const MENU = [
  { href: '/dashboard/trips', label: 'My trips' },
  { href: '/dashboard/bookings', label: 'My bookings' },
  { href: '/dashboard/vehicles', label: 'Cars' },
  { href: '/dashboard/profile', label: 'Profile' },
] as const;

/** Right-hand side of the header: login links when signed out, an account menu when signed in. */
export async function AuthArea() {
  const session = await auth();
  // Name and photo come from the database, not the JWT, so profile edits show up without signing in again.
  const user = session?.user?.id
    ? await db.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true, image: true } })
    : null;

  if (!user) {
    return (
      <>
        <Link href="/login" className="text-[15px] font-semibold hover:text-muted">
          Log in
        </Link>
        <ButtonLink href="/trips/new" variant="ghost" className="max-[420px]:px-3.5">
          Offer a ride
        </ButtonLink>
      </>
    );
  }

  const name = user.name || user.email || 'Account';
  return (
    <details className="relative">
      <summary
        aria-label={`Account menu for ${name}`}
        className="flex cursor-pointer list-none items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-soft [&::-webkit-details-marker]:hidden"
      >
        <Avatar name={name} image={user.image} size={32} />
        <span data-testid="user-name" className="hidden text-[15px] font-semibold sm:inline">
          {name}
        </span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-52 rounded-card border border-line bg-surface p-2 text-[15px] shadow-float">
        {MENU.map((item) => (
          <Link key={item.href} href={item.href} className="block rounded-[10px] px-3 py-2 hover:bg-soft">
            {item.label}
          </Link>
        ))}
        <SignOutButton />
      </div>
    </details>
  );
}
