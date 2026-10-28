'use server';

import { z } from 'zod';
import { defineAction } from '@/lib/action';
import { ok } from '@/lib/result';
import { searchPlaces } from './service';

export const searchPlacesAction = defineAction(z.object({ q: z.string().max(100) }), async ({ q }) =>
  ok(await searchPlaces(q)),
);
