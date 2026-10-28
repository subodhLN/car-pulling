import Link from 'next/link';
import { Rating } from '@/components/reviews/rating';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import { formatInr } from '@/lib/money';
import { formatIst } from '@/lib/time';
import type { TripSummary } from '@/modules/trips/search';

export function TripRow({ trip }: { trip: TripSummary }) {
  const arrival = trip.durationMin ? new Date(trip.departureAt.getTime() + trip.durationMin * 60_000) : null;
  const low = trip.seatsAvailable <= 1;
  const name = trip.driver.name ?? 'Driver';
  const pickupKm = Math.round(trip.pickupKm);

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="grid grid-cols-[74px_1fr_auto] gap-x-4 gap-y-1.5 rounded-card border border-line bg-surface p-[18px] text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-float motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="grid grid-rows-[auto_1fr_auto] text-[17px] font-bold tabular-nums">
        <span>{formatIst(trip.departureAt, 'HH:mm')}</span>
        {arrival ? (
          <>
            <i aria-hidden="true" className="my-1 ml-1.5 min-h-[18px] w-0.5 justify-self-start bg-line" />
            <span>
              <span className="sr-only">arrives </span>
              {formatIst(arrival, 'HH:mm')}
            </span>
          </>
        ) : null}
      </div>
      <div className="grid grid-rows-[auto_1fr_auto] text-[15px]">
        <span>{trip.originLabel}</span>
        <small className="text-[13px] text-muted">
          {pickupKm >= 1 ? `${pickupKm} km from your start` : ' '}
        </small>
        <span>{trip.destLabel}</span>
      </div>
      <div className="grid content-between text-right">
        <b className="text-xl font-extrabold tabular-nums">{formatInr(trip.pricePerSeat)}</b>
        <small className={cn('text-[13px] text-muted', low && 'font-semibold !text-brand')}>
          {trip.seatsAvailable === 1 ? '1 seat left' : `${trip.seatsAvailable} seats left`}
        </small>
      </div>
      <div className="col-span-full mt-1.5 flex min-w-0 flex-wrap items-center gap-2.5 border-t border-line pt-3 text-sm text-muted">
        <Avatar name={name} image={trip.driver.image} size={30} />
        <b className="font-semibold text-fg">{name}</b>
        <Rating avg={Number(trip.driver.ratingAvg)} count={trip.driver.ratingCount} className="font-semibold text-fg" />
        <span>
          · {trip.vehicle.color} {trip.vehicle.make} {trip.vehicle.model}
        </span>
      </div>
    </Link>
  );
}
