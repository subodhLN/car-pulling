'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { defineAction } from '@/lib/action';
import { clientIp } from '@/lib/client-ip';
import { ok } from '@/lib/result';
import { optionalUser } from '@/modules/auth/guards';
import { geoRateKey, limitedPlaceSearch, limitedReverse } from './service';

async function rateKey(): Promise<string> {
  const user = await optionalUser();
  return geoRateKey({ userId: user?.id ?? null, ip: clientIp(await headers()) });
}

export const searchPlacesAction = defineAction(z.object({ q: z.string().max(100) }), async ({ q }) =>
  ok(await limitedPlaceSearch(q, await rateKey())),
);

export const reversePlaceAction = defineAction(
  z.object({ lat: z.number().finite(), lng: z.number().finite() }),
  async (p) => ok(await limitedReverse(p, await rateKey())),
);
