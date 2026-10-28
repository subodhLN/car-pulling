import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { resetDb } from '../../helpers/db';

beforeEach(resetDb);

describe('rateLimit', () => {
  it('allows 10 then blocks the 11th within the window', async () => {
    for (let i = 0; i < 10; i++) expect(await rateLimit('auth:1.1.1.1', 10, 60)).toBe(true);
    expect(await rateLimit('auth:1.1.1.1', 10, 60)).toBe(false);
  });

  it('keys are independent', async () => {
    for (let i = 0; i < 10; i++) await rateLimit('a', 10, 60);
    expect(await rateLimit('b', 10, 60)).toBe(true);
  });

  it('starts a fresh window once the old one expired', async () => {
    for (let i = 0; i < 3; i++) await rateLimit('k', 2, 60);
    expect(await rateLimit('k', 2, 60)).toBe(false);
    await db.rateLimit.update({ where: { key: 'k' }, data: { windowStart: new Date(Date.now() - 61_000) } });
    expect(await rateLimit('k', 2, 60)).toBe(true);
    expect((await db.rateLimit.findUniqueOrThrow({ where: { key: 'k' } })).count).toBe(1);
  });
});
