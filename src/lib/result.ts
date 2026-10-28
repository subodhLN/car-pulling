export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'TRIP_FULL'
  | 'INVALID_STATE'
  | 'PAYMENT_FAILED'
  | 'RATE_LIMITED';

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(code: ErrorCode, message: string): Result<never> {
  return { ok: false, code, message };
}
