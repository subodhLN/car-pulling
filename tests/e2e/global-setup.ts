import { execSync } from 'node:child_process';

/** With E2E_SEED=1, reseed the dev database (wipes it) so the demo-login spec has its accounts. */
export default function globalSetup(): void {
  if (process.env.E2E_SEED !== '1') return;
  execSync('npm run db:seed', { stdio: 'inherit' });
}
