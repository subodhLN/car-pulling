import { execSync } from 'node:child_process';
import { assertSafeSeedTarget } from '../../prisma/seed-guard';

/**
 * With E2E_SEED=1, reseed the dev database (wipes it) so the demo-login spec has its accounts.
 * Only ever targets a local database: SEED_ALLOW is deliberately not honoured here.
 */
export default function globalSetup(): void {
  if (process.env.E2E_SEED !== '1') return;
  try {
    process.loadEnvFile('.env');
  } catch {
    // rely on the real environment
  }
  assertSafeSeedTarget(process.env.DATABASE_URL, process.env, { allowOverride: false });
  // The child must not see SEED_ALLOW either.
  const { SEED_ALLOW: _ignored, ...env } = process.env;
  void _ignored;
  execSync('npm run db:seed', { stdio: 'inherit', env });
}
