import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl py-[clamp(48px,10vw,120px)] text-center">
      <p className="text-sm font-bold tracking-[0.02em] text-brand">404</p>
      <h1 className="mt-2 text-[clamp(30px,4vw,46px)]">This road doesn’t go anywhere.</h1>
      <p className="mt-4 text-muted">
        The page you were looking for has moved or never existed. Let’s get you back on route.
      </p>
      <ButtonLink href="/" size="lg" className="mt-8">
        Back to home
      </ButtonLink>
    </section>
  );
}
