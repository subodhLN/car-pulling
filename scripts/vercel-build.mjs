// Vercel build entry point (`npm run vercel-build`).
// - Always regenerates the Prisma client: Vercel caches node_modules, so a cached client goes stale
//   after a schema change.
// - Applies migrations only on Production deploys. Preview deploys must never migrate the production
//   database (see docs/deploy.md).
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ steps: string[]; notice?: string }}
 */
export function buildPlan(env) {
  const target = env.VERCEL_ENV || 'unknown';
  if (target === 'production') {
    return { steps: ['prisma generate', 'prisma migrate deploy', 'next build'] };
  }
  return {
    steps: ['prisma generate', 'next build'],
    notice: `Skipping prisma migrate deploy on ${target} (migrations run only when VERCEL_ENV=production).`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { steps, notice } = buildPlan(process.env);
  if (notice) console.log(`[vercel-build] ${notice}`);
  for (const step of steps) {
    console.log(`[vercel-build] $ ${step}`);
    execSync(`npx ${step}`, { stdio: 'inherit' });
  }
}
