import { beforeEach, describe, expect, it } from 'vitest';
import { authorizeCredentials } from '@/modules/auth/authorize';
import { signUp } from '@/modules/auth/service';
import { resetDb } from '../../helpers/db';

beforeEach(resetDb);

const h = (ip: string) => new Headers({ 'x-real-ip': ip });

describe('authorizeCredentials rate limit', () => {
  it('rejects the 11th attempt from one IP even with the right password', async () => {
    await signUp({ name: 'M', email: 'm@example.com', password: 'longenough' });
    const bad = { email: 'm@example.com', password: 'wrongpass1' };
    for (let i = 0; i < 10; i++) expect(await authorizeCredentials(bad, h('5.5.5.5'))).toBeNull();
    await expect(
      authorizeCredentials({ email: 'm@example.com', password: 'longenough' }, h('5.5.5.5')),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    // another IP is unaffected
    expect(
      await authorizeCredentials({ email: 'm@example.com', password: 'longenough' }, h('6.6.6.6')),
    ).toMatchObject({ email: 'm@example.com' });
  });

  it('suspended account throws the coded error after the right password', async () => {
    const { db } = await import('@/lib/db');
    await signUp({ name: 'S', email: 's@example.com', password: 'longenough' });
    await db.user.update({ where: { email: 's@example.com' }, data: { status: 'SUSPENDED' } });
    await expect(
      authorizeCredentials({ email: 's@example.com', password: 'longenough' }, h('7.7.7.7')),
    ).rejects.toMatchObject({ code: 'suspended' });
  });
});
