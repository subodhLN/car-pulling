import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { signUp, verifyCredentials } from '@/modules/auth/service';
import { resetDb } from '../../helpers/db';
import { createUser } from '../../helpers/factories';

beforeEach(resetDb);

describe('auth service', () => {
  it('signUp then verifyCredentials succeeds', async () => {
    const res = await signUp({ name: 'Meera K', email: 'Meera@Example.com', password: 'longenough' });
    expect(res.ok).toBe(true);
    expect(await verifyCredentials('meera@example.com', 'longenough')).toMatchObject({ name: 'Meera K' });
    expect(await verifyCredentials('MEERA@example.com', 'longenough')).not.toBeNull();
  });

  it('stores a bcrypt hash, never the password', async () => {
    await signUp({ name: 'Meera K', email: 'm@example.com', password: 'longenough' });
    const u = await db.user.findUniqueOrThrow({ where: { email: 'm@example.com' } });
    expect(u.passwordHash).toMatch(/^\$2[aby]\$10\$/);
  });

  it('wrong password or unknown email → null', async () => {
    await signUp({ name: 'Meera K', email: 'm@example.com', password: 'longenough' });
    expect(await verifyCredentials('m@example.com', 'wrongpass1')).toBeNull();
    expect(await verifyCredentials('nobody@example.com', 'longenough')).toBeNull();
  });

  it('duplicate email → VALIDATION', async () => {
    await signUp({ name: 'A', email: 'dup@example.com', password: 'longenough' });
    const res = await signUp({ name: 'B', email: 'DUP@example.com', password: 'longenough' });
    expect(res).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: 'An account with this email already exists',
    });
  });

  it('short password → VALIDATION', async () => {
    const res = await signUp({ name: 'A', email: 'a@example.com', password: 'short' });
    expect(res).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('stores normalized phone', async () => {
    await signUp({ name: 'A', email: 'p@example.com', password: 'longenough', phone: '098765 43210' });
    const u = await db.user.findUniqueOrThrow({ where: { email: 'p@example.com' } });
    expect(u.phone).toBe('+919876543210');
  });

  it('invalid phone → VALIDATION', async () => {
    const res = await signUp({ name: 'A', email: 'p@example.com', password: 'longenough', phone: '12345' });
    expect(res).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: 'Enter a 10-digit Indian mobile number',
    });
  });

  it('suspended user cannot log in', async () => {
    await signUp({ name: 'S', email: 's@example.com', password: 'longenough' });
    await db.user.update({ where: { email: 's@example.com' }, data: { status: 'SUSPENDED' } });
    expect(await verifyCredentials('s@example.com', 'longenough')).toBeNull();
  });

  it('user without a password hash (OAuth-only) cannot use credentials', async () => {
    const u = await createUser({ email: 'g@example.com' });
    expect(await verifyCredentials(u.email, 'anything123')).toBeNull();
  });
});
