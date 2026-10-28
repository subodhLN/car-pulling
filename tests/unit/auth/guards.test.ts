import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: vi.fn() } } }));

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { requirePageUser, requireUser } from '@/modules/auth/guards';

const authMock = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>;
const findUnique = vi.mocked(db.user.findUnique) as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('requireUser', () => {
  it('throws UNAUTHENTICATED with no session', async () => {
    authMock.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('throws UNAUTHENTICATED when the user no longer exists', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    findUnique.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('throws NOT_ALLOWED for a suspended user', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    findUnique.mockResolvedValue({ id: 'u1', name: 'A', email: 'a@x.com', role: 'USER', status: 'SUSPENDED' });
    await expect(requireUser()).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
      message: 'Your account is suspended',
    });
  });

  it('returns the fresh SessionUser', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'USER' } });
    findUnique.mockResolvedValue({ id: 'u1', name: 'A', email: 'a@x.com', role: 'ADMIN', status: 'ACTIVE' });
    await expect(requireUser()).resolves.toEqual({ id: 'u1', name: 'A', email: 'a@x.com', role: 'ADMIN' });
  });
});

describe('requirePageUser', () => {
  it('redirects to /login with the encoded next path when unauthenticated', async () => {
    const { redirect } = await import('next/navigation');
    authMock.mockResolvedValue(null);
    await expect(requirePageUser('/trips/new?x=1')).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login?next=' + encodeURIComponent('/trips/new?x=1'));
  });

  it('rethrows other errors', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    findUnique.mockResolvedValue({ id: 'u1', name: 'A', email: 'a@x.com', role: 'USER', status: 'SUSPENDED' });
    await expect(requirePageUser('/x')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('returns the user when signed in', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    findUnique.mockResolvedValue({ id: 'u1', name: 'A', email: 'a@x.com', role: 'USER', status: 'ACTIVE' });
    await expect(requirePageUser('/x')).resolves.toMatchObject({ id: 'u1' });
  });
});
