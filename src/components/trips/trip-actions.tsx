import { CancelBookingButton } from '@/components/bookings/booking-actions';
import { RequestForm } from '@/components/bookings/request-form';
import { StatusBadge } from '@/components/bookings/status-badge';
import { ButtonLink } from '@/components/ui/button';
import { optionalUser } from '@/modules/auth/guards';
import { refundPreview, requestAvailability } from '@/modules/bookings/presentation';
import { findActiveBooking } from '@/modules/bookings/service';

type TripForActions = {
  id: string;
  driverId: string;
  status: 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
  seatsAvailable: number;
  pricePerSeat: number;
  departureAt: Date;
  driver: { status: 'ACTIVE' | 'SUSPENDED' };
};

/** The booking area of the trip page: what the current viewer can do with this trip. */
export async function TripActions({ trip, now }: { trip: TripForActions; now: Date }) {
  const user = await optionalUser();

  if (user && user.id === trip.driverId) {
    return (
      <ButtonLink href="/dashboard/trips" variant="ghost" className="mt-4 w-full">
        Manage this trip
      </ButtonLink>
    );
  }

  const booking = user ? await findActiveBooking(user.id, trip.id) : null;
  if (booking?.tripCancelled) {
    // An open booking left by a failed cancel cascade; the cron tick cancels it with a full refund (R17).
    return (
      <div className="mt-4 space-y-1 border-t border-line pt-4">
        <p className="text-sm font-semibold">Your booking</p>
        <p className="text-sm">Trip cancelled by the driver</p>
      </div>
    );
  }
  if (booking) {
    const seats = `${booking.seats} ${booking.seats === 1 ? 'seat' : 'seats'}`;
    return (
      <div className="mt-4 space-y-3 border-t border-line pt-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Your booking</span>
          <StatusBadge status={booking.status} />
          <span className="text-muted">{seats}</span>
        </p>
        {booking.status === 'REQUESTED' ? (
          <p className="text-sm text-muted">Waiting for the driver to respond.</p>
        ) : null}
        {booking.driverPhone ? (
          <p className="text-sm">
            Driver&apos;s phone:{' '}
            <a href={`tel:${booking.driverPhone}`} className="font-semibold underline underline-offset-2">
              {booking.driverPhone}
            </a>
          </p>
        ) : null}
        <CancelBookingButton
          bookingId={booking.id}
          refundNote={refundPreview(booking, trip.departureAt, now)}
          label={booking.status === 'REQUESTED' ? 'Cancel request' : 'Cancel booking'}
        />
      </div>
    );
  }

  const availability = requestAvailability(trip, now);
  if (!availability.open) return <p className="mt-4 text-sm font-semibold text-muted">{availability.message}</p>;

  if (!user) {
    return (
      <ButtonLink href={`/login?next=${encodeURIComponent(`/trips/${trip.id}`)}`} size="lg" className="mt-4 w-full">
        Log in to book
      </ButtonLink>
    );
  }

  return <RequestForm tripId={trip.id} seatsAvailable={trip.seatsAvailable} pricePerSeat={trip.pricePerSeat} />;
}
