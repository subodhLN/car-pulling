import { describe, expect, it } from 'vitest';
import { assertSafeSeedTarget } from '../../prisma/seed-guard';

const LOCAL = 'postgresql://rideshare:rideshare@localhost:5432/rideshare';
const NEON = 'postgresql://u:p@ep-cool-123.ap-south-1.aws.neon.tech/neondb?sslmode=require';

describe('assertSafeSeedTarget', () => {
  it('allows local hosts and reports the target', () => {
    expect(assertSafeSeedTarget(LOCAL, {})).toEqual({ host: 'localhost', database: 'rideshare' });
    for (const host of ['127.0.0.1', '[::1]', 'db']) {
      expect(() => assertSafeSeedTarget(`postgresql://a:b@${host}:5432/x`, {})).not.toThrow();
    }
  });

  it('refuses a Neon host unless SEED_ALLOW=1', () => {
    expect(() => assertSafeSeedTarget(NEON, {})).toThrow(/non-local database host/);
    expect(assertSafeSeedTarget(NEON, { SEED_ALLOW: '1' }).database).toBe('neondb');
  });

  it('refuses NODE_ENV=production without SEED_ALLOW, even for localhost', () => {
    expect(() => assertSafeSeedTarget(LOCAL, { NODE_ENV: 'production' })).toThrow(/NODE_ENV=production/);
    expect(() => assertSafeSeedTarget(LOCAL, { NODE_ENV: 'production', SEED_ALLOW: '1' })).not.toThrow();
  });

  it('refuses a missing or invalid URL', () => {
    expect(() => assertSafeSeedTarget(undefined, {})).toThrow();
    expect(() => assertSafeSeedTarget('nonsense', {})).toThrow();
  });

  it('E2E variant never honours SEED_ALLOW', () => {
    const opts = { allowOverride: false };
    expect(() => assertSafeSeedTarget(NEON, { SEED_ALLOW: '1' }, opts)).toThrow(/only targets a local/);
    expect(() => assertSafeSeedTarget(LOCAL, { NODE_ENV: 'production', SEED_ALLOW: '1' }, opts)).toThrow();
    expect(() => assertSafeSeedTarget(LOCAL, { SEED_ALLOW: '1' }, opts)).not.toThrow();
  });
});
