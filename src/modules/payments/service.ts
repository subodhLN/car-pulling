import { ok, type Result } from '@/lib/result';

// M1: payments are no-ops that always succeed. M5 replaces the bodies with Stripe calls
// (manual-capture PaymentIntents, idempotency key `${bookingId}:${action}`) and keeps these signatures.

/** Create the payment authorization for a new booking. M5 returns the PaymentIntent's client secret. */
export async function authorize(booking: { id: string; amount: number }): Promise<Result<{ clientSecret: string | null }>> {
  void booking;
  return ok({ clientSecret: null });
}

/** Capture the authorized amount (driver accepted). */
export async function capture(bookingId: string): Promise<Result<void>> {
  void bookingId;
  return ok(undefined);
}

/** Release an uncaptured authorization (rejected, expired, cancelled before acceptance). */
export async function release(bookingId: string): Promise<Result<void>> {
  void bookingId;
  return ok(undefined);
}

/** Refund `amount` paise of a captured payment. */
export async function refund(bookingId: string, amount: number): Promise<Result<void>> {
  void bookingId;
  void amount;
  return ok(undefined);
}
