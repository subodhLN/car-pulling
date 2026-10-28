# M1 follow-ups

Items found in M1 reviews and deliberately deferred. Pick them up in the milestone noted, or sooner if they bite.

## Done in M2
- ~~CI schema-drift check~~: `npm run db:drift` (scripts/check-drift.ts) runs in the CI integration job.
- ~~Server-side place validation~~: publishTrip and search params reject places outside India (`placeSchema` / `inIndia`). Labels from Photon are still user-submitted text (escaped on render); a driver can name a valid point freely.

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

## M2 follow-ups (deferred from the M2 final review)
- Prefix geo cache keys with the provider (`fake:` / `live:`) so local e2e runs can't seed fake results into local live dev.
- Search map on phones always shows the first ride; add a per-row "Show on map" control and highlight the mapped row on desktop.
- Resize refits discard the user's pan/zoom; theme switches replay the draw-in. Refit only until the user first moves the map.
- Import `maplibre-gl.css` only in the map chunks instead of globally (~70 KB on every page).
- Desktop search briefly shows the mobile "Show map" button before hydration (`useWide` server snapshot); drive it with CSS.
- `npm run db:drift` doesn't load `.env` (use `node --env-file=.env` or document `set -a; . ./.env`).
- Drop the picker's detail line when the label already ends with it; truncate Photon labels to 120 chars so publish can't fail on them.
- Announce picker hints in the live region; note in the pin dialog that keyboard users can type a place instead.
- `routeSummary` shows "3h 0m"; render "3h".
- Short circuit-breaker for Photon (skip it ~60 s after a failure) so autocomplete stays snappy during an outage.
- Prune expired `GeoCache` rows from the cron tick.
