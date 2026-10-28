import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Read-through cache in Postgres. Returns an unexpired stored value, otherwise calls `fn`
 * and stores its result. `null` and thrown results are never stored (a later call retries).
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T | null>,
  now: Date = new Date(),
): Promise<T | null> {
  const hit = await db.geoCache.findUnique({ where: { key } });
  if (hit && hit.expiresAt > now) return hit.response as T;

  const value = await fn();
  if (value === null) return null;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const response = value as Prisma.InputJsonValue;
  await db.geoCache.upsert({
    where: { key },
    create: { key, response, expiresAt },
    update: { response, expiresAt },
  });
  return value;
}
