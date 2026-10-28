import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runTick } from '@/modules/cron/tick';

export const dynamic = 'force-dynamic';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * True when the request carries `Authorization: Bearer ${CRON_SECRET}`. Both sides are hashed to a fixed
 * length so timingSafeEqual neither throws on a length mismatch nor leaks the secret's length.
 * An unset or empty CRON_SECRET never authorizes.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

/**
 * Called every 15 minutes by the GitHub Actions workflow (.github/workflows/cron-tick.yml), with a daily Vercel
 * cron (vercel.json) as backstop; both send the CRON_SECRET bearer token.
 */
export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runTick());
}
