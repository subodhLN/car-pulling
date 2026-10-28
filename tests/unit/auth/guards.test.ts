import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: vi.fn() } } }));
vi.mock('@/modules/trips/service', () => ({ findTripRow: vi.fn() }));

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { optionalUser, requirePageUser, requireTripDriver, requireUser } from '@/modules/auth/guards';
import { findTripRow } from '@/modules/trips/service';

const authMock = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>;
const findUnique = vi.mocked(db.user.findUnique) as unknown as ReturnType<typeof vi.fn>;
const findTrip = vi.mocked(findTripRow) as unknown as ReturnType<typeof vi.fn>;

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

describe('requireTripDriver', () => {
  const signedIn = (id: string) => {
    authMock.mockResolvedValue({ user: { id } });
    findUnique.mockResolvedValue({ id, name: 'A', email: 'a@x.com', role: 'USER', status: 'ACTIVE' });
  };

  it('returns the user and trip for the trip driver', async () => {
    signedIn('u1');
    findTrip.mockResolvedValue({ id: 't1', driverId: 'u1' });
    await expect(requireTripDriver('t1')).resolves.toMatchObject({ user: { id: 'u1' }, trip: { id: 't1' } });
    expect(findTrip).toHaveBeenCalledWith('t1');
  });

  it('throws NOT_FOUND for a missing trip', async () => {
    signedIn('u1');
    findTrip.mockResolvedValue(null);
    await expect(requireTripDriver('t1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_ALLOWED for someone else', async () => {
    signedIn('u2');
    findTrip.mockResolvedValue({ id: 't1', driverId: 'u1' });
    await expect(requireTripDriver('t1')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('throws UNAUTHENTICATED when signed out', async () => {
    authMock.mockResolvedValue(null);
    await expect(requireTripDriver('t1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(findTrip).not.toHaveBeenCalled();
  });
});

describe('optionalUser', () => {
  it('returns null when signed out', async () => {
    authMock.mockResolvedValue(null);
    await expect(optionalUser()).resolves.toBeNull();
  });

  it('returns the user when signed in', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    findUnique.mockResolvedValue({ id: 'u1', name: 'A', email: 'a@x.com', role: 'USER', status: 'ACTIVE' });
    await expect(optionalUser()).resolves.toMatchObject({ id: 'u1' });
  });

  it('returns null for a suspended user', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    findUnique.mockResolvedValue({ id: 'u1', name: 'A', email: 'a@x.com', role: 'USER', status: 'SUSPENDED' });
    await expect(optionalUser()).resolves.toBeNull();
  });
});
