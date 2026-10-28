/**
 * Client IP for rate-limit keys. Prefers x-real-ip (set by the trusted proxy), else the LAST
 * x-forwarded-for hop (the one our proxy appended; earlier hops are client-controlled).
 */
export function clientIp(h: Headers): string {
  const real = h.get('x-real-ip')?.trim();
  if (real) return real;
  const hops = h.get('x-forwarded-for')?.split(',').map((x) => x.trim()).filter(Boolean);
  return hops?.[hops.length - 1] ?? 'unknown';
}
