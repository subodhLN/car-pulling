# RideShare — Design Spec

**Date:** 2026-10-28
**Status:** Approved in brainstorming, pending written-spec review
**Working name:** RideShare (placeholder; rename later without code impact beyond copy and logo)

---

## 1. Purpose and success criteria

**What:** A BlaBlaCar-style carpooling web app. Drivers publish scheduled intercity trips with spare seats; passengers search, request seats, pay (Stripe test mode), chat with the driver, travel, and rate each other.

**Why:** A learning and portfolio project. It must be impressive, finishable, and demoable from a single link. It is not a real business: no real money, no legal/compliance work, no scale requirements.

**Success means:**
- A live deployed demo with seeded data and one-click demo logins.
- A clean, well-structured public repo with a strong README.
- Automated tests covering the critical flows (booking lifecycle, seat holding, payments, permissions).
- A visual design that looks like a real, photo-led consumer product, not a generic template.

**Defaults:** Region India, currency INR, timezone `Asia/Kolkata`. Seed data uses north-Indian cities.

---

## 2. Scope

Built in six milestones. Each milestone ends deployed and working on the live URL. Stopping after any milestone leaves a coherent app.

| Milestone | Scope |
|---|---|
| **M1 Core** | Auth, vehicles, publish trip, search, booking request/accept/reject (without payment), dashboards, cancellation, visual design system and home page |
| **M2 Maps** | Place autocomplete, route preview, radius ("nearby") search, styled map |
| **M3 Trust** | Ratings & reviews, public profiles, verification badges |
| **M4 Communication** | Per-booking messaging, in-app notifications, email notifications |
| **M5 Payments** | Stripe test mode: authorize on request, capture on accept, release/refund flows, earnings ledger |
| **M6 Admin** | Admin dashboard, user/trip moderation, reports queue, audit log |

**Out of scope (v1):** native mobile apps, real driver payouts (Stripe Connect), SMS/phone OTP, real ID verification, instant (on-demand) rides, live GPS tracking, multi-stop trips beyond a single pickup/drop point, user photo uploads, i18n.

**M1 note on payments:** In M1 the booking lifecycle runs without the payment step (REQUESTED is entered directly). M5 inserts `PENDING_PAYMENT` and the Stripe calls behind the existing `payments` module interface, so M1–M4 code does not change shape.

---

## 3. Architecture and stack

One Next.js application (latest stable, App Router, TypeScript) deployed to **Vercel**, with **Neon Postgres** (PostGIS enabled).

| Concern | Choice | Notes |
|---|---|---|
| UI | Tailwind CSS + shadcn/ui primitives, restyled to the design system in §9 | |
| Auth | Auth.js v5: email/password (credentials) + Google OAuth | Passwords hashed with bcrypt |
| DB | Prisma ORM; raw SQL (`$queryRaw`) for PostGIS queries | Prisma can't express `geography` types; those columns are `Unsupported("geography(Point,4326)")` |
| Map rendering | **MapLibre GL JS** + **OpenFreeMap** vector tiles with a custom style JSON | Free, no API key |
| Geocoding / autocomplete | **Photon** (public komoot instance) | Behind server `geo` adapter |
| Routing | **OSRM** public demo server | Behind server `geo` adapter |
| Payments | Stripe test mode, manual capture, webhooks | §6 |
| Email | Resend + React Email templates | |
| Data fetching / polling | TanStack Query | Messages ~3 s, notifications ~30 s |
| Scheduled jobs | Vercel Cron → `/api/cron/tick` every 15 min | §5.6 |
| Validation | Zod (shared client/server schemas) | |
| Logging | pino (structured) | |
| Tests | Vitest (unit + integration with Docker Postgres/PostGIS), Playwright (E2E) | §11 |
| CI | GitHub Actions: lint, typecheck, unit, integration | |

### 3.1 Code organization

```
src/
  app/                    # routes & pages only — thin; call server actions
  modules/
    auth/ trips/ bookings/ geo/ reviews/
    messaging/ notifications/ payments/ admin/ vehicles/ users/
      service.ts          # business rules; unit/integration tested
      actions.ts          # server actions: auth check → validate → call service
      schemas.ts          # Zod schemas
      components/         # UI for this feature
  lib/                    # db, stripe, email, logger, rate-limit, result type
  styles/                 # design tokens, map style JSON
```

**Rules:**
- Pages → server actions → services. Business rules live only in services.
- Modules interact only via each other's exported service functions (e.g. `bookings` calls `payments.authorize()`; it never imports the Stripe client).
- External services (Stripe, Resend, Photon, OSRM) are reached only through their module adapters, so tests can mock them at one boundary.

---

## 4. Data model

All money is integer **paise** (`₹450 → 45000`). All timestamps stored UTC, displayed in `Asia/Kolkata`.

| Model | Fields | Constraints / notes |
|---|---|---|
| **User** | id, name, email (unique), emailVerified, passwordHash?, image?, phone?, bio?, `role` (USER\|ADMIN), `status` (ACTIVE\|SUSPENDED), `idVerified` (bool), `ratingAvg` (decimal), `ratingCount` (int), createdAt | Rating fields denormalized, updated in the review transaction |
| Account, Session, VerificationToken | Auth.js standard tables | |
| **Vehicle** | id, ownerId, make, model, color, seats (passenger seats, excluding driver; 1–7), createdAt | Driver must have ≥1 vehicle to publish |
| **Trip** | id, driverId, vehicleId, originLabel, `originPoint` geography, destLabel, `destPoint` geography, routePolyline (encoded, nullable), distanceKm (nullable), durationMin (nullable), departureAt, seatsTotal, seatsAvailable, pricePerSeat (paise), `status` (PUBLISHED\|CANCELLED\|COMPLETED), notes?, createdAt | GiST indexes on both points; index on (status, departureAt); `seatsAvailable` between 0 and seatsTotal (CHECK) |
| **Booking** | id, tripId, passengerId, seats, amount (paise), `status`, stripePaymentIntentId?, expiresAt?, refundAmount (paise, default 0), cancelledBy (PASSENGER\|DRIVER\|ADMIN)?, createdAt, updatedAt | Status enum in §5 |
| **Review** | id, tripId, authorId, subjectId, rating (1–5), comment (≤500 chars)?, createdAt | Unique (tripId, authorId, subjectId) |
| **Message** | id, bookingId, senderId, body (1–1000 chars), createdAt, readAt? | Index (bookingId, createdAt) |
| **Notification** | id, userId, type, data (JSON), readAt?, createdAt | Index (userId, readAt, createdAt) |
| **Report** | id, reporterId, targetType (USER\|TRIP), targetId, reason (enum), details?, `status` (OPEN\|RESOLVED\|DISMISSED), resolvedById?, createdAt | |
| **AdminAction** | id, adminId, targetType, targetId, action, reason, createdAt | Append-only audit log |
| **StripeEvent** | eventId (PK), type, processedAt | Webhook idempotency |
| **GeoCache** | key (PK: hash of provider+query), response (JSON), expiresAt | Autocomplete 24 h, routes 30 days |
| **RateLimit** | key (PK), count, windowStart | Postgres-backed fixed-window limiter |

**Verification (demo-level):** "Email verified" is real (Resend magic link). "ID verified" is a flag an admin sets manually. Phone is entered but not SMS-verified. The UI only claims what is actually true.

---

## 5. Core flows

### 5.1 Publish a trip
Driver picks origin and destination via autocomplete (or by dropping a pin on the map), departure date/time (≥ 2 h in the future), vehicle, seats (1 to the vehicle's passenger seats), price per seat (₹50–₹5,000), and notes. On save, the server calls `geo.route(origin, dest)` to store polyline, distance and duration. If routing fails the trip is saved without them and the UI shows straight-line distance.

### 5.2 Search
Inputs: from (point), to (point), date, seats (default 1), radius (default 15 km; 5–50 km).

Returns PUBLISHED trips where `ST_DWithin(originPoint, from, r)` AND `ST_DWithin(destPoint, to, r)` AND departure on the given local date AND `departureAt > now() + 1h` AND `seatsAvailable ≥ seats` AND driver is ACTIVE. Sort by departure (default), price, or pickup distance. Paginated, 20 per page.

### 5.3 Booking lifecycle

States: `PENDING_PAYMENT`, `REQUESTED`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `ABANDONED`, `CANCELLED`, `COMPLETED`.

```
  request ─► PENDING_PAYMENT ──(15 min, no card)──────────► ABANDONED   [seats returned]
                   │ webhook: card authorized
                   ▼
               REQUESTED ──(driver rejects)───────────────► REJECTED    [hold released, seats returned]
                   │     ──(expiresAt passes)──────────────► EXPIRED     [hold released, seats returned]
                   │     ──(passenger cancels)─────────────► CANCELLED   [hold released, seats returned]
                   │ driver accepts → capture
                   ▼
               ACCEPTED ──(passenger cancels > 24 h before)─► CANCELLED [full refund, seats returned]
                   │     ──(passenger cancels ≤ 24 h before)─► CANCELLED [no refund, seats returned]
                   │     ──(driver/admin cancels)────────────► CANCELLED [full refund, seats returned]
                   ▼ trip completed (cron)
               COMPLETED → reviews unlocked
```

`expiresAt = min(requestedAt + 24 h, departureAt)` — always shorter than Stripe's 7-day authorization window.

**Rules:**
1. **Seat holding is atomic.** Seats are taken when the booking is created (PENDING_PAYMENT) with a single conditional update:
   `UPDATE "Trip" SET "seatsAvailable" = "seatsAvailable" - $n WHERE id = $id AND "seatsAvailable" >= $n AND status = 'PUBLISHED'`.
   Zero rows updated → `TRIP_FULL`. Every move into ABANDONED, REJECTED, EXPIRED or CANCELLED returns the seats in the same DB transaction.
2. **Single transition function.** `bookings.transition(bookingId, event, actor)` is the only code that changes `Booking.status`. It loads the booking with a row lock (`SELECT … FOR UPDATE`), validates the move against an explicit transition table, then performs side effects (seats, payment, notifications) in order. Invalid moves return `INVALID_STATE`.
3. **Booking rules:** a driver cannot book their own trip; at most one non-terminal booking per passenger per trip; no new requests within 1 h of departure; seats per booking 1–4.
4. **Driver cancels a trip:** trip → CANCELLED; every REQUESTED booking → CANCELLED (hold released); every ACCEPTED booking → CANCELLED (full refund). Each goes through `transition`.
5. **Phone numbers** of driver and passenger are revealed to each other only while the booking is ACCEPTED or COMPLETED.

### 5.4 Reviews
After a booking is COMPLETED, the driver and that passenger can each review the other once, within 14 days. Posting a review updates the subject's `ratingAvg`/`ratingCount` in the same transaction. Reviews cannot be edited; admins can delete abusive ones (logged in AdminAction and the rating is recomputed).

### 5.5 Profiles
Public profile: name, initials avatar (or Google image), member since, bio, rating with count, recent reviews, badges (Email verified, ID verified), completed rides as driver and as passenger. Phone and email are never public.

### 5.6 Cron tick (every 15 min, `CRON_SECRET` required)
1. Expire REQUESTED bookings past `expiresAt` → EXPIRED.
2. Reconcile PENDING_PAYMENT older than 15 min: query Stripe; if authorized → REQUESTED, else → ABANDONED.
3. Complete trips where `departureAt + durationMin (or 6 h if null) < now()`: trip → COMPLETED, ACCEPTED bookings → COMPLETED, send "rate your co-traveller" notifications.
4. Departure reminders: notify driver and accepted passengers for trips departing in the next 2–2.25 h (once; tracked by notification existence).

Each step is idempotent and processes in batches of 100.

---

## 6. Payments (Stripe test mode)

Driver payouts are **simulated**: an Earnings page shows captured amounts minus a 10 % demo platform fee, clearly labelled as demo.

**Flow:**
1. Passenger clicks *Request seats* → server holds seats, creates Booking (PENDING_PAYMENT) and a PaymentIntent (`currency: inr`, `capture_method: manual`, `metadata.bookingId`) → returns `clientSecret`.
2. Passenger enters a test card in Stripe Payment Element.
3. Webhook `payment_intent.amount_capturable_updated` → `transition(REQUESTED)` → driver notified.
4. Accept → `paymentIntents.capture()` → ACCEPTED. Reject/expire/cancel-before-accept → `paymentIntents.cancel()`. Refund → `refunds.create()`.
5. Webhook `payment_intent.payment_failed` / `canceled` while PENDING_PAYMENT → ABANDONED.

**Reliability rules:**
- Webhook signature verified. Each event's id is inserted into `StripeEvent` first; a duplicate insert means "already processed" and the handler returns 200 immediately.
- Every outbound Stripe call uses idempotency key `${bookingId}:${action}`.
- The DB state changes only after the Stripe call succeeds. On Stripe failure the booking stays in its current state and the action returns `PAYMENT_FAILED`.
- The cron reconcile step (§5.6) recovers from missed webhooks.

---

## 7. Messaging and notifications

### 7.1 Messaging
- One thread per booking, available from REQUESTED onward and read-only once the booking is terminal + 7 days.
- Only the trip's driver and that booking's passenger can read/write (checked in every action).
- Plain text, 1–1000 chars, rendered escaped. Rate limit 20 messages/min per user.
- Polling: open thread fetches `?after=<lastMessageId>` every 3 s; opening a thread marks the other party's messages read.

### 7.2 Notifications
- Single entry point `notifications.notify(userId, type, data)`.
- Always creates an in-app Notification. The bell polls unread count every 30 s; the dropdown lists the latest 20.
- Email (Resend) is also sent for: booking requested (to driver), accepted, rejected, expired, cancelled, departure reminder, review prompt, new message (throttled to at most one email per thread per 15 min).
- Email failures are logged and never roll back or block the triggering action.

---

## 8. Admin (M6)

Route group `/admin`, `requireAdmin()` on every action. First admin created by the seed script.

- **Dashboard:** totals (users, trips, bookings, demo GMV), bookings per day (last 30 days) chart, top 10 routes.
- **Users:** search, view detail, suspend/unsuspend, set ID-verified. Suspending cancels the user's future PUBLISHED trips (with refunds via `transition`) and their non-terminal bookings as passenger; suspended users cannot log in.
- **Trips:** search, view, force-cancel (refunds via `transition`).
- **Reviews:** delete abusive reviews (rating recomputed).
- **Reports:** any user can report a user or trip (reasons: unsafe behaviour, no-show, inappropriate messages, fake profile, other). Admin queue to resolve or dismiss.
- Every admin action writes an `AdminAction` row with a required reason.

---

## 9. Visual design system

Approved direction: **photographic and human** (reference: Airbnb / BlaBlaCar). Approved mockup: `docs/design/home-mockup.html`.

### 9.1 Principles
- **Photography carries the brand.** Candid, natural-light images of people and Indian places. No staged stock smiles, no car-only beauty shots, no illustrations in place of photos.
- **Neutral canvas, one brand colour.** The colour is used only for primary actions, the route line, and small accents (e.g. "1 seat left").
- **Quiet, physical motion.** No glows, no gimmicks.
- **Content over decoration.** No feature-icon grids, no emoji, no gradient hero.
- **Copy only claims what's true.** The mockup's trust copy ("confirms their phone number and ID") is replaced with copy matching §4: verified email, admin-checked ID badge, two-way ratings, card charged only on acceptance.

### 9.2 Tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#151312` |
| `--soft` | `#f6f3f0` | `#1d1a18` |
| `--surface` | `#ffffff` | `#211e1b` |
| `--fg` | `#1f1b18` | `#f3efeb` |
| `--muted` | `#6b635d` | `#a69d95` |
| `--line` | `#e9e4df` | `#2f2a27` |
| `--brand` (saffron-red) | `#d2431f` | `#ff6a43` |
| `--brand-ink` (text on brand) | `#ffffff` | `#1a0d08` |

Dark mode follows the system setting with a manual toggle. Semantic colours (success/warning/error) are separate from `--brand`.

**Type:** Figtree for everything (weights 400–800). Headlines 800, tight tracking (−0.03 em), `text-wrap: balance`. Body 16 px / 1.5. Tabular numerals for times and prices.

**Shape:** radius 28 px hero, 20 px photo cards, 18 px content cards, pill (999 px) search bar and buttons. One shadow token, used only for floating elements (search bar, map card, hovered cards).

### 9.3 Key screens
- **Home:** inset rounded full-bleed hero photo with headline; pill search bar overlapping the hero's bottom edge (stacks to a 2-column grid on phones and sits below the hero); "Popular this weekend" photo route cards; trust section with photo; footer.
- **Search results:** trip list (time rail, pickup/drop, price, seats left, driver row with rating and car) beside a sticky map; selecting a trip highlights its route and pickup pin. On phones the map collapses into a toggle.
- **Trip detail:** photo of destination city, route map, timeline, driver profile card, seat selector, request button.
- **Dashboards, chat, profile, admin:** same tokens; utilitarian layout, no hero photos.

### 9.4 Motion
- Hero photo settles from 1.07× to 1× over 1.8 s; headline and search fade up (staggered).
- Photo cards: 1.045× image zoom inside the frame on hover; content cards lift 2 px with shadow.
- Map route draws in once (≈1.6 s) on load and whenever the selected trip changes.
- Page/route transitions: 150–200 ms fades. Everything respects `prefers-reduced-motion` (all animation off).

### 9.5 Cursor
Native cursor everywhere, except over photo route cards, where a dark pill label ("View Delhi → Jaipur →") follows the pointer with easing. Only for fine pointers; disabled for touch and reduced motion.

### 9.6 Map style
Custom MapLibre style JSON derived from OpenFreeMap's base: land `#f3efe9`, water `#cfe1e6`, minor roads white, highways `#e6dccf`, muted labels; a dark variant mirrors the dark tokens. Route line in `--brand` with a surface-coloured casing. Pickup pin = ring in `--fg`; destination pin = filled `--brand` dot. Map card overlay summarises the selected trip.

### 9.7 Imagery
Destination and hero photos from Unsplash (Unsplash License), downloaded at build-time into `public/images`, served via `next/image`, with credits on an `/credits` page. Users show Google profile photos or initials avatars.

### 9.8 Accessibility
WCAG 2.2 AA: contrast ≥ 4.5:1 for text, visible focus ring in `--brand`, all controls keyboard-operable, map has a text equivalent (trip list), form errors announced with `aria-live`.

---

## 10. Error handling and security

### 10.1 Errors
- Server actions return `Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string }`. Codes include `UNAUTHENTICATED`, `NOT_ALLOWED`, `NOT_FOUND`, `VALIDATION`, `TRIP_FULL`, `INVALID_STATE`, `PAYMENT_FAILED`, `RATE_LIMITED`. UI maps each code to friendly copy.
- Unexpected exceptions are logged with pino and shown as a generic error; `error.tsx` and `not-found.tsx` exist at the root and in key segments.
- External degradation: Photon down → user can drop a pin on the map; OSRM down → trip saved without route, straight-line distance shown; Resend down → logged only.

### 10.2 Security
- Authorization helpers run before any query: `requireUser()`, `requireTripDriver(tripId)`, `requireBookingParty(bookingId)`, `requireAdmin()`. Suspended users are rejected at login and in `requireUser()`.
- Zod validation on every action input.
- Stripe webhook signature check; cron route requires `CRON_SECRET`.
- Rate limits (Postgres-backed): sign-up/login 10/min per IP, booking requests 10/hour per user, messages 20/min per user, geo autocomplete 30/min per user, reports 5/hour per user.
- No user-supplied HTML is ever rendered. Secrets only in environment variables; `.env.example` committed.

---

## 11. Testing

- **Unit (Vitest):** booking transition table (every allowed and disallowed move), refund policy around the 24 h boundary, `expiresAt` calculation, fee/earnings calculation, permission helpers, Zod schemas.
- **Integration (Vitest + Docker Postgres/PostGIS):** concurrent seat holding (10 parallel requests for the last seat → exactly 1 success), radius search correctness, webhook idempotency (same event twice → one transition), trip-cancel refund cascade, cron tick steps. Stripe, Resend, Photon, OSRM mocked at their module adapters.
- **E2E (Playwright):** (1) sign up → add vehicle → publish → second user searches → requests (test card) → driver accepts → chat → cron completes trip → both review; (2) request → reject → seats restored and hold released.
- **CI:** GitHub Actions runs lint, typecheck, unit and integration on every push; E2E runs on pushes to `main`.

---

## 12. Seed data, demo and deployment

- **Seed:** ~30 users (initials avatars), ~80 trips between Delhi, Gurugram, Noida, Chandigarh, Jaipur, Agra, Amritsar, Dehradun, Shimla, Ludhiana with real routes (precomputed OSRM polylines stored in the seed), mix of past and future dates, bookings in every state, reviews, messages, a few open reports.
- **Demo logins** shown on the login page: `driver@demo.test`, `passenger@demo.test`, `admin@demo.test` (shared demo password shown on page).
- **README:** screenshots, architecture diagram, booking state diagram, local setup, Stripe test cards, credits.
- **Local dev:** `docker compose` (Postgres + PostGIS), Stripe CLI webhook forwarding, `.env.example`.
- **Production:** Vercel (app + cron) and Neon (Postgres + PostGIS). Each milestone ends with a deploy and a smoke test on the live URL.
