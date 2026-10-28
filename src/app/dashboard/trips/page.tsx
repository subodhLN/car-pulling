import type { Metadata } from 'next';
import Link from 'next/link';
import { CancelTripButton, RequestDecision } from '@/components/bookings/booking-actions';
import { StatusBadge } from '@/components/bookings/status-badge';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatIst } from '@/lib/time';
import { requirePageUser } from '@/modules/auth/guards';
import { listDriverTrips, type DriverTrip } from '@/modules/bookings/service';

export const metadata: Metadata = { title: 'Your trips' };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function cancelConfirmText(trip: DriverTrip): string {
  const accepted = trip.bookings.filter((b) => b.status === 'ACCEPTED').length;
  const requested = trip.bookings.filter((b) => b.status === 'REQUESTED' || b.status === 'PENDING_PAYMENT').length;
  const refund =
    accepted > 0
      ? `${plural(accepted, 'passenger', 'passengers')} will be refunded in full.`
      : 'No passengers have been accepted, so no refunds are due.';
  const pending = requested > 0 ? ` ${plural(requested, 'pending request', 'pending requests')} will be cancelled.` : '';
  return `Cancel this trip? ${refund}${pending}`;
}

function TripCard({ trip, upcoming }: { trip: DriverTrip; upcoming: boolean }) {
  const manageable = upcoming && trip.status === 'PUBLISHED';
  return (
    <li>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/trips/${trip.id}`} className="text-lg font-bold hover:underline">
              {trip.originLabel} → {trip.destLabel}
            </Link>
            <p className="text-sm text-muted">{formatIst(trip.departureAt, 'EEE, d MMM yyyy · h:mm a')}</p>
          </div>
          {trip.status === 'PUBLISHED' ? (
            <p className="text-sm font-semibold">
              {trip.seatsAvailable} of {plural(trip.seatsTotal, 'seat', 'seats')} left
            </p>
          ) : (
            <Badge>{trip.status === 'CANCELLED' ? 'Cancelled' : 'Completed'}</Badge>
          )}
        </div>

        {trip.bookings.length === 0 ? (
          <p className="text-sm text-muted">No booking requests yet.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line" aria-label="Booking requests">
            {trip.bookings.map((b) => {
              const name = b.passenger.name ?? 'Passenger';
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={name} image={b.passenger.image} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{name}</p>
                    <p className="text-sm text-muted">
                      {b.passenger.ratingCount === 0
                        ? 'New'
                        : `★ ${b.passenger.ratingAvg.toFixed(1)} (${b.passenger.ratingCount})`}
                      {' · '}
                      {plural(b.seats, 'seat', 'seats')}
                    </p>
                    {b.passenger.phone ? (
                      <p className="text-sm">
                        Phone:{' '}
                        <a href={`tel:${b.passenger.phone}`} className="font-semibold underline underline-offset-2">
                          {b.passenger.phone}
                        </a>
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge status={b.status} />
                  {manageable && b.status === 'REQUESTED' ? <RequestDecision bookingId={b.id} passengerName={name} /> : null}
                </li>
              );
            })}
          </ul>
        )}

        {manageable ? <CancelTripButton tripId={trip.id} confirmText={cancelConfirmText(trip)} /> : null}
      </Card>
    </li>
  );
}

function Section({ title, trips, upcoming }: { title: string; trips: DriverTrip[]; upcoming: boolean }) {
  if (trips.length === 0) return null;
  const id = `${title.toLowerCase()}-trips`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      <ul className="space-y-3">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} upcoming={upcoming} />
        ))}
      </ul>
    </section>
  );
}

export default async function DriverTripsPage() {
  const user = await requirePageUser('/dashboard/trips');
  const trips = await listDriverTrips(user.id);
  const now = new Date().getTime();

  if (trips.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-muted">You haven&apos;t offered any rides yet.</p>
        <ButtonLink href="/trips/new">Offer a ride</ButtonLink>
      </div>
    );
  }

  const isUpcoming = (t: DriverTrip) => t.status === 'PUBLISHED' && t.departureAt.getTime() > now;
  const upcoming = trips.filter(isUpcoming);
  const past = trips.filter((t) => !isUpcoming(t)).reverse(); // most recent first

  return (
    <div className="space-y-8">
      {upcoming.length === 0 ? (
        <p className="text-muted">
          No upcoming rides. <Link href="/trips/new" className="font-semibold text-fg underline underline-offset-2">Offer a ride</Link>
        </p>
      ) : null}
      <Section title="Upcoming" trips={upcoming} upcoming />
      <Section title="Past" trips={past} upcoming={false} />
    </div>
  );
}
