import { describe, expect, it } from 'vitest';
import { err, ok } from '@/lib/result';

describe('result', () => {
  it('ok wraps data', () => {
    expect(ok(1)).toEqual({ ok: true, data: 1 });
  });
  it('err carries code and message', () => {
    expect(err('NOT_FOUND', 'x')).toEqual({ ok: false, code: 'NOT_FOUND', message: 'x' });
  });
});
