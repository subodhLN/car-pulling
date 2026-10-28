import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decode6 } from '@/lib/polyline';
import { CITIES } from '@/modules/geo/cities';
import { haversineKm } from '@/modules/geo/service';
import type { RouteInfo } from '@/modules/geo/types';
import { CORRIDORS } from '../../../prisma/seed-corridors';

const routes: Record<string, RouteInfo> = JSON.parse(readFileSync('prisma/seed-routes.json', 'utf8'));
const city = (slug: string) => CITIES.find((c) => c.slug === slug)!;

describe('prisma/seed-routes.json', () => {
  it('has a route for every corridor in both directions', () => {
    for (const [a, b] of CORRIDORS) {
      expect(routes[`${a}->${b}`], `${a}->${b}`).toBeDefined();
      expect(routes[`${b}->${a}`], `${b}->${a}`).toBeDefined();
    }
  });

  it('every route decodes (polyline6) to a line from one city to the other', () => {
    for (const [key, r] of Object.entries(routes)) {
      const [from, to] = key.split('->').map(city);
      const pts = decode6(r.polyline);
      expect(haversineKm(pts[0], from), `${key} start`).toBeLessThan(30);
      expect(haversineKm(pts.at(-1)!, to), `${key} end`).toBeLessThan(30);
      expect(r.distanceKm).toBeGreaterThan(haversineKm(from, to) * 0.9);
      expect(Number.isInteger(r.durationMin)).toBe(true);
    }
  });
});
