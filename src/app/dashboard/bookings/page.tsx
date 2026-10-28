import type { Metadata } from 'next';
import Link from 'next/link';
import { BookingFlash, CancelBookingButton } from '@/components/bookings/booking-actions';
import { StatusBadge } from '@/components/bookings/status-badge';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatInr } from '@/lib/money';
import { formatIst } from '@/lib/time';
import { requirePageUser } from '@/modules/auth/guards';
import { isOpen, refundPreview, showsTripCancelled } from '@/modules/bookings/presentation';
import { listPassengerBookings, type PassengerBooking } from '@/modules/bookings/service';

export const metadata: Metadata = { title: 'Your bookings' };

function BookingCard({ booking, now, upcoming }: { booking: PassengerBooking; now: Date; upcoming: boolean }) {
  const { trip } = booking;
  const driverName = trip.driver.name ?? 'Driver';
  return (
    <li>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/trips/${trip.id}`} className="text-lg font-bold hover:underline">
              {trip.originLabel} → {trip.destLabel}
            </Link>
            <p className="text-sm text-muted">{formatIst(trip.departureAt, 'EEE, d MMM yyyy · h:mm a')}</p>
          </div>
          {showsTripCancelled(booking, trip.status) ? (
            <Badge>Trip cancelled by the driver</Badge>
          ) : (
            <StatusBadge status={booking.status} />
          )}
        </div>
        <div className="flex items-center gap-3">
          <Avatar name={driverName} image={trip.driver.image} size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{driverName}</p>
            <p className="text-sm text-muted">
              {booking.seats} {booking.seats === 1 ? 'seat' : 'seats'} · {formatInr(booking.amount)}
            </p>
            {trip.driver.phone ? (
              <p className="text-sm">
                Driver&apos;s phone:{' '}
                <a href={`tel:${trip.driver.phone}`} className="font-semibold underline underline-offset-2">
                  {trip.driver.phone}
                </a>
              </p>
            ) : null}
          </div>
        </div>
        {booking.status === 'CANCELLED' && booking.refundAmount > 0 ? (
          <p className="text-sm text-muted">Refunded {formatInr(booking.refundAmount)}</p>
        ) : null}
        {upcoming && isOpen(booking.status) ? (
          <CancelBookingButton
            bookingId={booking.id}
            refundNote={refundPreview(booking, trip.departureAt, now)}
            label={booking.status === 'REQUESTED' ? 'Cancel request' : 'Cancel booking'}
          />
        ) : null}
      </Card>
    </li>
  );
}

function Section(props: { title: string; bookings: PassengerBooking[]; now: Date; upcoming: boolean }) {
  if (props.bookings.length === 0) return null;
  const id = `${props.title.toLowerCase()}-bookings`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-bold">
        {props.title}
      </h2>
      <ul className="space-y-3">
        {props.bookings.map((b) => (
          <BookingCard key={b.id} booking={b} now={props.now} upcoming={props.upcoming} />
        ))}
      </ul>
    </section>
  );
}

export default async function PassengerBookingsPage() {
  const user = await requirePageUser('/dashboard/bookings');
  const bookings = await listPassengerBookings(user.id);
  const now = new Date();

  if (bookings.length === 0) {
    return (
      <div className="space-y-4">
        <BookingFlash />
        <p className="text-muted">You haven&apos;t booked any rides yet.</p>
        <ButtonLink href="/search">Find a ride</ButtonLink>
      </div>
    );
  }

  const isUpcoming = (b: PassengerBooking) =>
    isOpen(b.status) && b.trip.status === 'PUBLISHED' && b.trip.departureAt.getTime() > now.getTime();
  const upcoming = bookings
    .filter(isUpcoming)
    .sort((a, b) => a.trip.departureAt.getTime() - b.trip.departureAt.getTime());
  const past = bookings.filter((b) => !isUpcoming(b));

  return (
    <>
      <BookingFlash className="mb-6" />
      <div className="space-y-8">
        <Section title="Upcoming" bookings={upcoming} now={now} upcoming />
        <Section title="Past" bookings={past} now={now} upcoming={false} />
      </div>
    </>
  );
}
