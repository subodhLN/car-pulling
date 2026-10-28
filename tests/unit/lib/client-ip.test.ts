import { describe, expect, it } from 'vitest';
import { clientIp } from '@/lib/client-ip';

describe('clientIp', () => {
  it('x-real-ip wins', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '1.1.1.1' }))).toBe('2.2.2.2');
  });
  it('uses the last x-forwarded-for hop (spoof-resistant)', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }))).toBe('9.9.9.9');
  });
  it('falls back to unknown', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
