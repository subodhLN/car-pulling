/** Pure guard for the destructive seed (it TRUNCATEs every table). No imports: also used by Playwright. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

export type SeedTarget = { host: string; database: string };

/**
 * Throws unless seeding `databaseUrl` is safe. Local hosts (localhost, 127.0.0.1, ::1, docker service `db`)
 * are allowed; anything else needs SEED_ALLOW=1, unless `allowOverride` is false (E2E seeding), in which case
 * only local hosts ever pass. NODE_ENV=production always needs SEED_ALLOW=1 (and is refused when the override
 * is disabled). Returns the target so callers can print it before wiping.
 */
export function assertSafeSeedTarget(
  databaseUrl: string | undefined,
  env: Record<string, string | undefined>,
  { allowOverride = true }: { allowOverride?: boolean } = {},
): SeedTarget {
  if (!databaseUrl) throw new Error('Refusing to seed: DATABASE_URL is not set.');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing to seed: DATABASE_URL is not a valid URL.');
  }
  const target = { host: url.hostname, database: decodeURIComponent(url.pathname.replace(/^\//, '')) };
  const override = allowOverride && env.SEED_ALLOW === '1';
  if (env.NODE_ENV === 'production' && !override) {
    throw new Error('Refusing to seed: NODE_ENV=production. Set SEED_ALLOW=1 to override.');
  }
  if (!LOCAL_HOSTS.has(target.host) && !override) {
    throw new Error(
      `Refusing to seed non-local database host "${target.host}" (this wipes all data).` +
        (allowOverride ? ' Set SEED_ALLOW=1 to override.' : ' E2E seeding only targets a local database.'),
    );
  }
  return target;
}
