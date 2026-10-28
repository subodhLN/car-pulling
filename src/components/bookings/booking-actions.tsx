'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatInr } from '@/lib/money';
import type { Result } from '@/lib/result';
import { acceptBookingAction, cancelBookingAction, rejectBookingAction } from '@/modules/bookings/actions';
import { cancelTripAction } from '@/modules/trips/actions';

/**
 * Runs a booking server action inside a transition and refreshes the page on success. INVALID_STATE
 * (e.g. a second click, or the other party acted first) is not alarming: the page is refreshed to show
 * the current state and the message is shown as a quiet note. Other failures are shown as errors.
 */
export function useBookingAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function run<T>(action: () => Promise<Result<T>>, onDone?: (data?: T) => void) {
    setError(null);
    setNote(null);
    setFlash(null);
    start(async () => {
      const res = await action();
      if (res.ok) {
        onDone?.(res.data);
        router.refresh();
        return;
      }
      if (res.code === 'INVALID_STATE') {
        setNote(res.message);
        onDone?.();
        router.refresh();
        return;
      }
      setError(res.message);
    });
  }

  return { pending, error, note, run };
}

export function ActionMessages({ error, note }: { error: string | null; note: string | null }) {
  if (error) {
    return (
      <p role="alert" className="w-full text-sm text-danger">
        {error}
      </p>
    );
  }
  if (note) {
    return (
      <p role="status" className="w-full text-sm text-muted">
        {note}
      </p>
    );
  }
  return null;
}

/*
 * Outcome message for a completed cancel. Module-level so it survives router.refresh(), which re-renders
 * the page and unmounts the button that set it (the booking moves out of the open state). <BookingFlash />
 * sits in a stable spot on the page and clears it when the page unmounts.
 */
let flash: string | null = null;
const flashListeners = new Set<() => void>();
function setFlash(message: string | null) {
  flash = message;
  for (const l of flashListeners) l();
}
function subscribeFlash(l: () => void) {
  flashListeners.add(l);
  return () => {
    flashListeners.delete(l);
  };
}

export function BookingFlash({ className }: { className?: string }) {
  const message = useSyncExternalStore(subscribeFlash, () => flash, () => null);
  useEffect(() => () => setFlash(null), []);
  return (
    <p
      role="status"
      className={message ? cn('rounded-[14px] bg-soft px-4 py-3 text-sm font-semibold', className) : 'sr-only'}
    >
      {message}
    </p>
  );
}

/** Passenger cancel with an inline confirm step; `refundNote` (computed server-side) is shown before confirming. */
export function CancelBookingButton({
  bookingId,
  refundNote,
  label = 'Cancel booking',
}: {
  bookingId: string;
  refundNote: string | null;
  label?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const { pending, error, note, run } = useBookingAction();

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {confirming ? (
        <div role="group" aria-label="Confirm cancelling this booking" className="flex w-full flex-wrap items-center gap-2">
          <p className="w-full text-sm font-semibold">
            {refundNote ? `Cancel this booking? ${refundNote}.` : 'Cancel this booking?'}
          </p>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              run(
                () => cancelBookingAction({ bookingId }),
                (data) => {
                  setConfirming(false);
                  if (!data) return; // INVALID_STATE: the refreshed page shows the current state
                  // The amount transition() actually refunded, not the render-time preview.
                  if (data.refundAmount > 0) setFlash(`Booking cancelled. Refunded ${formatInr(data.refundAmount)}.`);
                  else setFlash(refundNote ? 'Booking cancelled. No refund.' : 'Request cancelled.');
                },
              )
            }
          >
            {pending ? 'Cancelling…' : 'Yes, cancel'}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            Keep booking
          </Button>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          {label}
        </Button>
      )}
      <ActionMessages error={error} note={note} />
    </div>
  );
}

/** Driver's Accept / Reject for a REQUESTED booking. */
export function RequestDecision({ bookingId, passengerName }: { bookingId: string; passengerName: string }) {
  const { pending, error, note, run } = useBookingAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={pending}
        aria-label={`Accept ${passengerName}`}
        onClick={() => run(() => acceptBookingAction({ bookingId }))}
      >
        Accept
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        aria-label={`Reject ${passengerName}`}
        onClick={() => run(() => rejectBookingAction({ bookingId }))}
      >
        Reject
      </Button>
      <ActionMessages error={error} note={note} />
    </div>
  );
}

/** Driver cancels a whole trip, with an inline confirm that says who will be refunded. */
export function CancelTripButton({ tripId, confirmText }: { tripId: string; confirmText: string }) {
  const [confirming, setConfirming] = useState(false);
  const { pending, error, note, run } = useBookingAction();
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {confirming ? (
        <div role="group" aria-label="Confirm cancelling this trip" className="flex w-full flex-wrap items-center gap-2">
          <p className="w-full text-sm font-semibold">{confirmText}</p>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => run(() => cancelTripAction({ tripId }), () => setConfirming(false))}
          >
            {pending ? 'Cancelling…' : 'Yes, cancel trip'}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            Keep trip
          </Button>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          Cancel trip
        </Button>
      )}
      <ActionMessages error={error} note={note} />
    </div>
  );
}
