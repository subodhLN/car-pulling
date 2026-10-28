import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchFilters } from '@/components/trips/search-filters';
import { SearchForm } from '@/components/trips/search-form';
import { TripRow } from '@/components/trips/trip-row';
import { Card } from '@/components/ui/card';
import { buttonClasses } from '@/components/ui/button';
import { addDaysIso, formatIst, istDayRange } from '@/lib/time';
import type { Place } from '@/modules/geo/cities';
import { countTrips, searchTrips } from '@/modules/trips/search';
import { parseSearchParams } from '@/modules/trips/search-params';

export const metadata: Metadata = { title: 'Find a ride' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const SORT_LABEL = { departure: 'departure', price: 'price', pickup: 'pickup distance' } as const;

function pageHref(params: Record<string, string | string[] | undefined>, overrides: Record<string, string>) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined) out.set(k, val);
  }
  for (const [k, v] of Object.entries(overrides)) out.set(k, v);
  return `/search?${out.toString()}`;
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const { query, fromLabel, toLabel } = parseSearchParams(params, now);
  const today = formatIst(now, 'yyyy-MM-dd');

  if (!query) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Find a ride</h1>
        <p className="text-muted">Choose where you&apos;re leaving from and going to</p>
        <SearchForm initial={{ from: null, to: null, date: today, seats: 1, radius: 15, sort: 'departure' }} />
      </div>
    );
  }

  const [{ items, hasMore, page }, total] = await Promise.all([searchTrips(query, now), countTrips(query, now)]);
  const sort = query.sort ?? 'departure';
  const radius = query.radiusKm ?? 15;
  const place = (label: string, p: { lat: number; lng: number }): Place => ({ label, lat: p.lat, lng: p.lng });
  const weekday = formatIst(istDayRange(query.date).start, 'EEEE');

  // Keyed on the query so in-page navigation (Try next day, pagination, filters, back/forward) remounts the
  // form with the new values instead of keeping its previous state.
  const formKey = JSON.stringify({ query, fromLabel, toLabel });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <SearchForm
        key={formKey}
        initial={{
          from: place(fromLabel, query.from),
          to: place(toLabel, query.to),
          date: query.date,
          seats: query.seats ?? 1,
          radius,
          sort,
        }}
      />
      <div className="grid gap-6 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section aria-labelledby="results-heading" className="space-y-4">
          <div>
            <h1 id="results-heading" className="text-2xl font-extrabold tracking-tight">
              {fromLabel} to {toLabel}, {weekday}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {total} {total === 1 ? 'ride' : 'rides'} · sorted by {SORT_LABEL[sort]}
            </p>
          </div>
          <SearchFilters sort={sort} radius={radius} />

          {items.length === 0 ? (
            <Card className="space-y-4">
              <p className="font-semibold">No rides on this day yet — try the next day or widen the area</p>
              <Link
                href={pageHref(params, { date: addDaysIso(query.date, 1), page: '1' })}
                className={buttonClasses({ variant: 'ghost' })}
              >
                Try next day
              </Link>
            </Card>
          ) : (
            <ul className="grid gap-3">
              {items.map((t) => (
                <li key={t.id}>
                  <TripRow trip={t} />
                </li>
              ))}
            </ul>
          )}

          {page > 1 || hasMore ? (
            <nav aria-label="Pagination" className="flex justify-between">
              {page > 1 ? (
                <Link href={pageHref(params, { page: String(page - 1) })} className={buttonClasses({ variant: 'ghost' })}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              {hasMore ? (
                <Link href={pageHref(params, { page: String(page + 1) })} className={buttonClasses({ variant: 'ghost' })}>
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>

        <aside className="hidden min-[960px]:block">
          <div className="grid min-h-[420px] place-items-center rounded-[22px] border border-line bg-soft p-6 text-center text-muted">
            Map arrives in the next update
          </div>
        </aside>
      </div>
    </div>
  );
}
