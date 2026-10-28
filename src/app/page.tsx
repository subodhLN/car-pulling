import Link from 'next/link';
import { connection } from 'next/server';
import { Hero } from '@/components/home/hero';
import { RouteCard, type RouteCardProps } from '@/components/home/route-card';
import { SearchBar } from '@/components/home/search-bar';
import { TrustSection } from '@/components/home/trust-section';
import { formatInr } from '@/lib/money';
import { formatIst, istDayRange } from '@/lib/time';
import { CITIES } from '@/modules/geo/cities';
import { MATCH_RADIUS_KM, popularRoutes, type PopularRoute } from '@/modules/trips/popular';
import { searchHref } from '@/modules/trips/search-params';

const CARDS = 4;

/** Curated routes that fill the section while there are fewer than four live ones (it is never empty). */
const CURATED: [origin: string, dest: string][] = [
  ['delhi', 'jaipur'],
  ['delhi', 'agra'],
  ['chandigarh', 'amritsar'],
  ['chandigarh', 'shimla'],
];

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today if it is Saturday or Sunday in IST, otherwise the coming Saturday. */
function weekendDate(today: string): string {
  const isoWeekday = Number(formatIst(istDayRange(today).start, 'i')); // 1 = Mon … 7 = Sun
  return isoWeekday >= 6 ? today : addDays(today, 6 - isoWeekday);
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

function liveCard(r: PopularRoute): RouteCardProps {
  return {
    // Both ends are matched route cities, so their slugs always exist (destSlug is null only if the list lacks one).
    href: searchHref({
      from: r.originSlug,
      to: r.destSlug ?? r.destLabel.toLowerCase(),
      date: r.nextDate,
      radius: MATCH_RADIUS_KM, // the radius the ride count was computed with
    }),
    originLabel: r.originLabel,
    destLabel: r.destLabel,
    destSlug: r.destSlug,
    badge: r.rides === 1 ? '1 ride' : `${r.rides} rides`,
    meta: {
      text: `${r.avgDurationMin ? `${formatDuration(r.avgDurationMin)} · ` : ''}from `,
      strong: formatInr(r.minPrice),
    },
  };
}

function curatedCard(origin: string, dest: string, date: string): RouteCardProps {
  const label = (slug: string) => CITIES.find((c) => c.slug === slug)?.label ?? slug;
  return {
    href: searchHref({ from: origin, to: dest, date }),
    originLabel: label(origin),
    destLabel: label(dest),
    destSlug: dest,
    badge: 'See rides',
    meta: { text: `Search ${formatIst(istDayRange(date).start, 'EEE, d MMM')}` },
  };
}

export default async function HomePage() {
  await connection(); // live data: render per request, never at build time
  const now = new Date();
  const today = formatIst(now, 'yyyy-MM-dd');
  const live = await popularRoutes(CARDS, now);

  const taken = new Set(live.map((r) => `${r.originSlug}>${r.destSlug}`));
  const weekend = weekendDate(today);
  const cards = [
    ...live.map(liveCard),
    ...CURATED.filter(([o, d]) => !taken.has(`${o}>${d}`)).map(([o, d]) => curatedCard(o, d, weekend)),
  ].slice(0, CARDS);

  return (
    <>
      <Hero />
      <SearchBar today={today} />

      <section aria-labelledby="popular-heading" className="pt-[72px]">
        <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="popular-heading" className="text-[clamp(24px,3vw,32px)] leading-[1.1] tracking-[-0.025em]">
              Popular this weekend
            </h2>
            <p className="mt-1 text-muted">
              {live.length > 0 ? 'Routes people are sharing over the next few days.' : 'Weekend drives from Delhi and Chandigarh.'}
            </p>
          </div>
          <Link
            href="/search"
            className="border-b-[1.5px] border-current pb-px font-semibold transition-colors hover:text-muted"
          >
            Search all rides
          </Link>
        </div>
        <ul className="grid grid-cols-4 gap-[18px] max-[960px]:grid-cols-2 max-[960px]:gap-x-3.5 max-[960px]:gap-y-6">
          {cards.map((c) => (
            <li key={c.href} className="min-w-0">
              <RouteCard {...c} />
            </li>
          ))}
        </ul>
      </section>

      <TrustSection />
    </>
  );
}
