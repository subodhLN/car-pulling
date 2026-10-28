import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';

/**
 * Right-hand side of the header for signed-out visitors.
 * Placeholder until auth lands (Task 4 replaces this component).
 */
export function AuthArea() {
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
