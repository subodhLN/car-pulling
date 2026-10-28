import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../scripts/vercel-build.mjs';

describe('vercel-build plan', () => {
  it('production: generate, migrate, build', () => {
    const plan = buildPlan({ VERCEL_ENV: 'production' });
    expect(plan.steps).toEqual(['prisma generate', 'prisma migrate deploy', 'next build']);
    expect(plan.notice).toBeUndefined();
  });

  it.each(['preview', 'development'])('%s: skips migrations with a clear notice', (env) => {
    const plan = buildPlan({ VERCEL_ENV: env });
    expect(plan.steps).toEqual(['prisma generate', 'next build']);
    expect(plan.notice).toBe(`Skipping prisma migrate deploy on ${env} (migrations run only when VERCEL_ENV=production).`);
  });

  it('unset VERCEL_ENV: skips migrations', () => {
    const plan = buildPlan({});
    expect(plan.steps).toEqual(['prisma generate', 'next build']);
    expect(plan.notice).toContain('Skipping prisma migrate deploy on unknown');
  });
});
