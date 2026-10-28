import { db } from './db';

/**
 * Fixed-window rate limiter backed by the RateLimit table.
 * One atomic upsert: a new key or an expired window starts at 1, otherwise the count increments.
 * Returns true when the call is within `limit` for the current window.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSec}::double precision) THEN 1
        ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSec}::double precision) THEN now()
        ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}
