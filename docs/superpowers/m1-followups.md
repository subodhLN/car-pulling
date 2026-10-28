# M1 follow-ups

Items found in M1 reviews and deliberately deferred. Pick them up in the milestone noted, or sooner if they bite.

## Before M2 adds migrations
- Add a CI schema-drift check (`prisma migrate diff`). The GiST indexes, the seat CHECK constraint and the partial unique index are hand-written SQL (see `prisma/README.md`), and `prisma migrate dev` without `--create-only` would drop the GiST indexes.
- M2 replaces the fixed city list: validate submitted places server-side against the geocoder result, not trusting hidden lat/lng inputs.

## M5 (payments)
- `transition()` retries once on deadlock and re-runs its payment call; Stripe calls need idempotency keys `${bookingId}:${action}` (spec §6) or must move outside the retried transaction.
- A failed `payments.authorize` currently leaves the REQUESTED booking holding seats; the PENDING_PAYMENT flow and cron reconcile must cover it.

## M6 (admin)
- Restore admin powers deliberately: `actorFor` grants no ADMIN actor in M1 (ruling R21). Admin checks must use `requireUser().role`, never the possibly stale `session.user.role`.
- Admin-cancelled trips currently read "cancelled by the driver" and re-cancelled bookings record `cancelledBy: DRIVER`.
- Hide the demo panel (`NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false`) or delete `admin@demo.test` before admin tooling ships.

## Polish (any time)
- Segment-level `error.tsx` / `not-found.tsx` (spec §10.1).
- Login timing reveals whether an email exists (bcrypt only runs for known emails).
- Sign-up uses two auth rate-limit slots (action + authorize).
- Vehicle list: per-row Delete buttons need distinct `aria-label`s; manage focus in inline confirms.
- `getTrip` runs twice per trip page request (wrap in React `cache`).
- CityPicker: handle a rejected `searchPlacesAction`; empty hidden lat/lng coerce to 0.
- Search: `pickupKm` is rounded before the `>= 1` check; `radius=7` has no matching selector option; a page past the end shows the "no rides" copy.
- Home: "Popular this weekend" uses a 7-day window; hero image is 2000px wide; credits link to the CDN source without photographer names.
- Dashboard flash message isn't tied to a specific booking card.
- `x-real-ip` is trusted first for rate limiting (correct on Vercel; revisit for any self-hosted deploy).
- Test hardening: deterministic assertion of the deadlock-retry path; the tick batch test uses one trip; live route-card radius is covered only by a conditional e2e test.
