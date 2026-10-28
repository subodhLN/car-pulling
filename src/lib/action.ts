import type { z } from 'zod';
import { AppError } from './errors';
import { logger } from './logger';
import { err, type Result } from './result';

export function defineAction<S extends z.ZodTypeAny, T>(
  schema: S,
  handler: (input: z.infer<S>) => Promise<Result<T>>,
): (raw: unknown) => Promise<Result<T>> {
  return async (raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return err('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    try {
      return await handler(parsed.data);
    } catch (e) {
      if (e instanceof AppError) return err(e.code, e.message);
      logger.error({ err: e }, 'Unhandled error in action');
      return err('INVALID_STATE', 'Something went wrong');
    }
  };
}
