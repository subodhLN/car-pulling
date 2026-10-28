import { describe, expect, it } from 'vitest';
import { formatInr } from '@/lib/money';

describe('formatInr', () => {
  it.each([
    [45000, '₹450'],
    [45050, '₹450.50'],
    [12345600, '₹1,23,456'],
  ])('formatInr(%i)', (p, s) => expect(formatInr(p)).toBe(s));
});
