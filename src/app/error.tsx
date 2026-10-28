'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const digest =
      error instanceof Error && 'digest' in error ? (error as Error & { digest?: string }).digest : undefined;
    logger.error({ err: error, digest }, 'Unhandled error in route segment');
  }, [error]);

  return (
    <section className="mx-auto max-w-xl py-[clamp(48px,10vw,120px)] text-center">
      <h1 className="text-[clamp(30px,4vw,46px)]">Something went wrong on our side.</h1>
      <p className="mt-4 text-muted">
        It’s not you. Try again, and if it keeps happening, head back home and start over.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/" className="inline-flex h-14 items-center px-4 font-semibold underline underline-offset-4">
          Back to home
        </Link>
      </div>
    </section>
  );
}
