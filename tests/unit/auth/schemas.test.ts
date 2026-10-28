import { describe, expect, it } from 'vitest';
import { normalizeIndianPhone, safeNext, signUpSchema } from '@/modules/auth/schemas';

describe('normalizeIndianPhone', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['91-9876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['+91-6000-000000', '+916000000000'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  it.each(['12345', '5876543210', '98765432101', '+1 9876543210', 'abcdefghij', ''])('rejects %s', (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
  });
});

describe('signUpSchema', () => {
  const base = { name: 'Meera', email: 'm@example.com', password: 'longenough' };
  it('normalizes phone and treats blank as absent', () => {
    expect(signUpSchema.parse({ ...base, phone: '98765 43210' }).phone).toBe('+919876543210');
    expect(signUpSchema.parse({ ...base, phone: '  ' }).phone).toBeUndefined();
  });
  it('rejects a bad phone with the spec copy', () => {
    const r = signUpSchema.safeParse({ ...base, phone: '123' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('Enter a 10-digit Indian mobile number');
  });
});

describe('safeNext', () => {
  it.each([
    ['/dashboard/trips', '/dashboard/trips'],
    ['/trips/new?x=1', '/trips/new?x=1'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    [undefined, '/'],
    ['', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
