import type { ErrorCode } from '@/lib/result';

/** User-facing copy for auth failures, keyed by error code. */
export function authErrorMessage(code: ErrorCode, message: string): string {
  switch (code) {
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a minute and try again.';
    case 'NOT_ALLOWED':
      return 'Your account is suspended.';
    default:
      return message || 'Something went wrong. Please try again.';
  }
}
