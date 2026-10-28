'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { formatInr } from '@/lib/money';
import { requestBookingAction } from '@/modules/bookings/actions';
import { ActionMessages, useBookingAction } from './booking-actions';

const MAX_SEATS_PER_BOOKING = 4;

/** Seat selector (1..min(4, seats left)) and the "Request seats" button. */
export function RequestForm({
  tripId,
  seatsAvailable,
  pricePerSeat,
}: {
  tripId: string;
  seatsAvailable: number;
  pricePerSeat: number;
}) {
  const max = Math.min(MAX_SEATS_PER_BOOKING, seatsAvailable);
  const [seats, setSeats] = useState(1);
  const { pending, error, note, run } = useBookingAction();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(() => requestBookingAction({ tripId, seats }));
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <div className="flex items-end gap-3">
        <div className="w-28">
          <label htmlFor="seats" className="mb-1.5 block text-sm font-semibold">
            Seats
          </label>
          <Select id="seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))} disabled={pending}>
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <p className="pb-2.5 text-sm text-muted">
          Total <span className="font-bold text-fg">{formatInr(seats * pricePerSeat)}</span>
        </p>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Requesting…' : 'Request seats'}
      </Button>
      <ActionMessages error={error} note={note} />
    </form>
  );
}
