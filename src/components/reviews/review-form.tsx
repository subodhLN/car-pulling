'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { MAX_COMMENT } from '@/modules/reviews/schemas';
import { postReviewAction } from '@/modules/reviews/actions';
import type { ReviewTarget } from '@/modules/reviews/service';
import { StarInput } from './star-input';

const MESSAGES: Partial<Record<string, string>> = {
  UNAUTHENTICATED: 'Your session has ended. Sign in again to post your review.',
  NOT_ALLOWED: 'You can only review people you travelled with.',
};

/**
 * "Rate <name>" card for one completed ride. `given` is the rating already posted, if any; the parent
 * keeps the same key once posted so the thank-you survives the page refresh.
 */
export function ReviewForm({ target, given }: { target: ReviewTarget; given?: number }) {
  const router = useRouter();
  const id = useId();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const [pending, start] = useTransition();

  if (posted) {
    return (
      <p role="status" className="text-sm font-semibold text-success">
        Thanks — your review is posted
      </p>
    );
  }
  if (given !== undefined) {
    return (
      <p className="text-sm text-muted">
        You rated {target.subjectName} <span className="font-semibold text-fg">{'★'.repeat(given)}</span>
        <span className="sr-only">{given} out of 5</span>
      </p>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNote(null);
    if (rating === 0) {
      setError('Choose a rating from 1 to 5 stars');
      return;
    }
    start(async () => {
      const res = await postReviewAction({ tripId: target.tripId, subjectId: target.subjectId, rating, comment });
      if (res.ok) {
        setPosted(true);
        router.refresh();
      } else if (res.code === 'INVALID_STATE') {
        // Already reviewed (e.g. another tab) or the window closed: show the current state.
        setNote(res.message);
        router.refresh();
      } else {
        setError(MESSAGES[res.code] ?? res.message);
      }
    });
  }

  const headingId = `${id}-heading`;
  return (
    <form onSubmit={onSubmit} aria-labelledby={headingId} className="space-y-3 rounded-card bg-soft p-4">
      <h3 id={headingId} className="font-bold">
        Rate {target.subjectName}
      </h3>
      <StarInput name="rating" value={rating} onChange={setRating} disabled={pending} />
      <div>
        <label htmlFor={`${id}-comment`} className="mb-1.5 block text-sm font-semibold">
          Comment (optional)
        </label>
        <textarea
          id={`${id}-comment`}
          name="comment"
          rows={2}
          maxLength={MAX_COMMENT}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={pending}
          aria-describedby={`${id}-count`}
          placeholder={target.role === 'DRIVER' ? 'How was the ride?' : 'How was travelling with them?'}
          className="w-full rounded-[14px] border border-line bg-surface px-4 py-3 text-base text-fg placeholder:text-muted hover:border-muted"
        />
        <p id={`${id}-count`} className="text-right text-xs text-muted tabular-nums">
          {comment.length}/{MAX_COMMENT}
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Posting…' : 'Post review'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : note ? (
        <p role="status" className="text-sm text-muted">
          {note}
        </p>
      ) : null}
    </form>
  );
}
