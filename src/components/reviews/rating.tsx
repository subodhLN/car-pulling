import { cn } from '@/lib/cn';

/** A user's rating: "New" until the first review, then `★ 4.8 (12)`. */
export function Rating({ avg, count, className }: { avg: number; count: number; className?: string }) {
  if (count === 0) return <span className={className}>New</span>;
  const shown = avg.toFixed(1);
  return (
    <span
      className={cn('tabular-nums', className)}
      title={`Rated ${shown} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`}
    >
      ★ {shown} ({count})
    </span>
  );
}
