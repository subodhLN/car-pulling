import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineAction } from '@/lib/action';
import { AppError } from '@/lib/errors';
import { ok } from '@/lib/result';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

describe('defineAction', () => {
  it('returns VALIDATION for bad input', async () => {
    const a = defineAction(z.object({ n: z.number() }), async ({ n }) => ok(n));
    expect(await a({ n: 'x' })).toMatchObject({ ok: false, code: 'VALIDATION' });
  });
  it('passes parsed input to the handler', async () => {
    const a = defineAction(z.object({ n: z.number() }), async ({ n }) => ok(n * 2));
    expect(await a({ n: 2 })).toEqual({ ok: true, data: 4 });
  });
  it('maps AppError to its code', async () => {
    const a = defineAction(z.object({}), async () => {
      throw new AppError('NOT_ALLOWED', 'no');
    });
    expect(await a({})).toEqual({ ok: false, code: 'NOT_ALLOWED', message: 'no' });
  });
  it('maps unknown errors to INVALID_STATE', async () => {
    const a = defineAction(z.object({}), async () => {
      throw new Error('boom');
    });
    expect(await a({})).toEqual({ ok: false, code: 'INVALID_STATE', message: 'Something went wrong' });
  });
});
