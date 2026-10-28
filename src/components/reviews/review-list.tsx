import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { formatIst } from '@/lib/time';
import type { ReviewListItem } from '@/modules/reviews/service';

export function ReviewList({ reviews }: { reviews: ReviewListItem[] }) {
  if (reviews.length === 0) return <p className="text-muted">No reviews yet</p>;
  return (
    <ul className="divide-y divide-line">
      {reviews.map((r) => {
        const name = r.author.name ?? 'RideShare member';
        return (
          <li key={r.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
            <Avatar name={name} image={r.author.image} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Link href={`/users/${r.author.id}`} className="font-semibold hover:underline">
                  {name}
                </Link>
                <time dateTime={r.createdAt.toISOString()} className="text-sm text-muted">
                  {formatIst(r.createdAt, 'MMMM yyyy')}
                </time>
              </div>
              <p className="text-brand" aria-label={`${r.rating} out of 5 stars`}>
                {'★'.repeat(r.rating)}
                <span className="text-line">{'★'.repeat(5 - r.rating)}</span>
              </p>
              {r.comment ? <p className="mt-1 break-words whitespace-pre-line">{r.comment}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
