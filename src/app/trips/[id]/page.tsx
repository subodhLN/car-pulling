import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingFlash } from '@/components/bookings/booking-actions';
import { RouteMap } from '@/components/map/route-map';
import { Rating } from '@/components/reviews/rating';
import { TripActions } from '@/components/trips/trip-actions';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatInr } from '@/lib/money';
import { formatIst } from '@/lib/time';
import { routeSummary } from '@/modules/trips/route-summary';
import { getTrip } from '@/modules/trips/service';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const trip = await getTrip((await params).id);
  return { title: trip ? `${trip.origin.label} to ${trip.dest.label}` : 'Trip' };
}

export default async function TripPage({ params }: Props) {
  const trip = await getTrip((await params).id);
  if (!trip) notFound();

  const arrival = trip.durationMin ? new Date(trip.departureAt.getTime() + trip.durationMin * 60_000) : null;
  const driverName = trip.driver.name ?? 'Driver';
  const seatsLeft = `${trip.seatsAvailable} ${trip.seatsAvailable === 1 ? 'seat' : 'seats'} left`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="text-sm font-semibold text-muted">{formatIst(trip.departureAt, 'EEEE, d MMMM yyyy')}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          {trip.origin.label} → {trip.dest.label}
        </h1>
        {trip.status !== 'PUBLISHED' ? (
          <Badge tone="warning" className="mt-2">
            {trip.status.charAt(0) + trip.status.slice(1).toLowerCase()}
          </Badge>
        ) : null}
      </header>

      <div className="relative">
        <RouteMap
          className="h-[260px] sm:h-[360px]"
          origin={trip.origin}
          dest={trip.dest}
          polyline={trip.routePolyline}
        />
        <p className="pointer-events-none absolute top-4 right-16 left-4 max-w-sm rounded-[16px] bg-surface px-4 py-3 text-sm shadow-float">
          {routeSummary({ originLabel: trip.origin.label, durationMin: trip.durationMin, distanceKm: trip.distanceKm })}
        </p>
      </div>

      <Card>
        <ol className="relative space-y-6 border-l-2 border-brand pl-6">
          <li className="relative">
            <span className="absolute top-1.5 -left-[33px] size-3 rounded-full border-2 border-fg bg-surface" aria-hidden="true" />
            <p className="text-lg font-bold">{formatIst(trip.departureAt, 'h:mm a')}</p>
            <p>{trip.origin.label}</p>
          </li>
          <li className="relative">
            <span className="absolute top-1.5 -left-[33px] size-3 rounded-full bg-brand" aria-hidden="true" />
            {arrival ? <p className="text-lg font-bold">{formatIst(arrival, 'h:mm a')}</p> : null}
            <p>{trip.dest.label}</p>
          </li>
        </ol>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="flex items-center gap-4">
          <Avatar name={driverName} image={trip.driver.image} size={56} />
          <div>
            <p className="font-bold">{driverName}</p>
            <p className="text-sm text-muted">
              <Rating avg={Number(trip.driver.ratingAvg)} count={trip.driver.ratingCount} />
            </p>
            <p className="mt-1 text-sm">
              {trip.vehicle.make} {trip.vehicle.model} · {trip.vehicle.color}
            </p>
          </div>
        </Card>
        <Card>
          <p className="text-3xl font-extrabold">
            {formatInr(trip.pricePerSeat)} <span className="text-base font-semibold text-muted">per seat</span>
          </p>
          <p className="mt-2 font-semibold">{seatsLeft}</p>
          <BookingFlash className="mt-4" />
          <TripActions trip={trip} now={new Date()} />
        </Card>
      </div>

      {trip.notes ? (
        <Card>
          <h2 className="mb-1 text-sm font-bold text-muted">Notes from the driver</h2>
          <p className="whitespace-pre-line">{trip.notes}</p>
        </Card>
      ) : null}
    </div>
  );
}
