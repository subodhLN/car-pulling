/**
 * Regenerates prisma/seed-routes.json from the public OSRM server so seeding never needs the network.
 * Run when the seed corridors change: `npm run seed:routes` (about one request per second).
 */
import { writeFileSync } from 'node:fs';
import { CITIES } from '@/modules/geo/cities';
import { osrmRoute } from '@/modules/geo/providers/osrm';
import type { RouteInfo } from '@/modules/geo/types';
import { CORRIDORS } from '../prisma/seed-corridors';

const city = (slug: string) => {
  const c = CITIES.find((x) => x.slug === slug);
  if (!c) throw new Error(`unknown city ${slug}`);
  return c;
};

async function main() {
  const out: Record<string, RouteInfo> = {};
  const pairs = CORRIDORS.flatMap(([a, b]) => [
    [a, b],
    [b, a],
  ]);
  for (const [a, b] of pairs) {
    const r = await osrmRoute(city(a), city(b));
    if (!r) throw new Error(`no route ${a}->${b}`);
    out[`${a}->${b}`] = r;
    console.log(`${a}->${b}: ${r.distanceKm} km, ${r.durationMin} min`);
    await new Promise((res) => setTimeout(res, 1000));
  }
  writeFileSync('prisma/seed-routes.json', JSON.stringify(out, null, 2) + '\n');
}

main();
