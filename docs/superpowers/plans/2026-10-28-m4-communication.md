# RideShare M4 (Communication) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep drivers and passengers informed and connected: in-app notifications with a bell, transactional email, a message thread per booking, departure reminders, review prompts, and real email verification.

**Architecture:** One `notifications.notify()` entry point writes an in-app Notification and, for chosen types, sends an email through an `email` adapter (Resend in production, an in-memory outbox in tests, console in local dev). Bookings publish a `BookingChanged` event after each committed transition; a single handler maps events to notifications. Messages live in their own module with party checks and rate limits; the client polls with TanStack Query (messages every 3 s, bell every 30 s).

**Tech Stack:** M3 stack plus `@tanstack/react-query` (latest 5.x, exact pin), `resend` (latest, exact pin), `@react-email/components` + `@react-email/render` (latest, exact pins).

**Spec:** `docs/superpowers/specs/2026-10-28-rideshare-design.md` — §4 (Message, Notification, verification), §5.6 step 4 (departure reminders), §7 Messaging and notifications, §10.2 (rate limits). Baseline: `main` after M3.

## Global Constraints

- `notify(userId, type, data)` is the only way to create notifications; it always writes the in-app row and sends email only for email types. **Email failures are logged and never roll back or block the triggering action.**
- Notification types (string union, stored as text): `BOOKING_REQUESTED` (to driver), `BOOKING_ACCEPTED`, `BOOKING_REJECTED`, `BOOKING_EXPIRED` (to passenger), `BOOKING_CANCELLED` (to the other party), `NEW_MESSAGE` (to recipient), `DEPARTURE_REMINDER` (driver + accepted passengers), `REVIEW_PROMPT` (both parties of each completed booking). All of these send email (spec §7.2).
- `NEW_MESSAGE` email: at most one per (thread, recipient) per 15 minutes; the in-app notification is still created every time.
- Idempotent system notifications use a unique `dedupeKey`: `reminder:<tripId>:<userId>`, `review:<tripId>:<userId>`. A duplicate insert is ignored (no second email).
- Departure reminders: trips PUBLISHED departing in `(now + 2 h, now + 2 h 15 min]` (the cron runs every 15 min).
- Messages: one thread per booking; parties only (trip driver and booking passenger), checked in every action; writable from `REQUESTED` onward while the booking is active, and for 7 days after it ends; read-only after that ("This conversation has closed"); `PENDING_PAYMENT` and `ABANDONED` bookings have no thread. Body 1–1000 chars, trimmed, plain text rendered escaped. Rate limit 20/min per user (`msg:<userId>`).
- Polling: open thread fetches `?after=<lastMessageId>` every 3 s; bell polls unread count every 30 s; dropdown shows the latest 20. Polling pauses while the tab is hidden (TanStack Query default `refetchIntervalInBackground: false`).
- Email verification: token 32 random bytes (base64url), only its SHA-256 stored in `VerificationToken`, expiry 24 h, single use; link `<NEXT_PUBLIC_APP_URL>/verify-email?token=…`; resend limited to 3/hour per user. Google sign-ins with `email_verified: true` are marked verified.
- Env: `RESEND_API_KEY` (unset → console adapter in dev), `EMAIL_FROM` (e.g. `RideShare <hello@yourdomain>`), `EMAIL_PROVIDER=memory` in tests and CI.
- Copy is short and specific, e.g. subject "Rohit accepted your seat to Jaipur", never "Notification".
- All M1–M3 constraints still apply.

## Review Focus

1. **Email outage** — Resend throwing must not fail accept/reject/cancel/message send; the in-app notification still exists. (Task 1)
2. **Message from a non-party** — guessing a bookingId and posting or reading returns `NOT_ALLOWED`, with no difference between "doesn't exist" and "not yours" visible to the caller. (Task 3)
3. **Cron overlap** — two ticks running together send each departure reminder exactly once (dedupeKey). (Task 2)
4. **Chatty threads** — 10 messages in 2 minutes produce 10 in-app notifications but only 1 email to the recipient. (Task 3)
5. **Stale verification links** — an expired or reused token shows "This link has expired. Send a new one from your profile." and does not verify. (Task 5)

---

## File Structure

```
prisma/schema.prisma                         + Notification (Task 1, migration <ts>_notifications), Message (Task 3, migration <ts>_messages)
src/modules/email/{send,templates/*}.tsx      adapter (resend | console | memory) + React Email templates
src/modules/notifications/{service,actions,booking-handler}.ts
src/modules/bookings/events.ts               BookingChanged type + emit after commit
src/modules/messages/{service,schemas,actions}.ts
src/modules/auth/verify-email.ts             token create/consume
src/app/verify-email/page.tsx
src/app/dashboard/bookings/[id]/messages/page.tsx   thread page (both parties)
src/components/providers/query-provider.tsx  TanStack QueryClientProvider
src/components/notifications/bell.tsx
src/components/messages/{thread,composer}.tsx
src/modules/cron/tick.ts                     + reminders step
tests/integration/{notifications,messages}/*.test.ts  tests/unit/email/*.test.ts  tests/e2e/messages.spec.ts
```

---

### Task 1: Notifications, email adapter and templates

**Files:**
- Create: `src/modules/email/send.ts`, `src/modules/email/templates/{layout,booking,message,reminder,review,verify}.tsx`, `src/modules/notifications/service.ts`, migration
- Modify: `prisma/schema.prisma`, `.env.example`, `vitest*.config.ts` (`EMAIL_PROVIDER=memory`), CI env
- Test: `tests/unit/email/send.test.ts`, `tests/integration/notifications/service.test.ts`

**Interfaces:**
- Produces:
  - Prisma `Notification { id, userId, type String, data Json, readAt DateTime?, emailedAt DateTime?, dedupeKey String? @unique, createdAt }`, index `(userId, readAt, createdAt)`.
  - `type NotificationType` (union above); `type NotificationData` = `{ bookingId?: string; tripId?: string; actorName?: string; route?: string /* "Delhi → Jaipur" */; departureAt?: string /* ISO */; preview?: string }`.
  - `sendEmail(msg: { to: string; subject: string; react: ReactElement }): Promise<void>` — throws on provider failure; `memory` provider exposes `outbox(): { to; subject; html }[]` and `clearOutbox()` for tests.
  - `notify(userId: string, type: NotificationType, data: NotificationData, opts?: { dedupeKey?: string; email?: boolean /* default true */ }): Promise<{ created: boolean }>` — inserts (dedupe conflict → `{ created: false }`, no email); renders the template for `type`; sends; sets `emailedAt`; on email error logs `logger.warn` and returns normally.
  - `listNotifications(userId, limit = 20)`, `unreadCount(userId)`, `markAllRead(userId)`, `markRead(userId, id)`.
  - Templates share a layout with the RideShare wordmark, brand colour button, plain-text fallback; every email links to the relevant page.

- [ ] **Step 1: Write failing tests** — memory outbox receives subject "Rohit accepted your seat to Jaipur"; `notify` with a dedupeKey twice → one row, one email (Review Focus 3 primitive); `sendEmail` throwing → `notify` resolves, row exists, `emailedAt` null (Review Focus 1); `email: false` creates no email; unreadCount/markAllRead.
- [ ] **Step 2: Run** `npm test && npm run test:int` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; `npm run db:drift` clean.
- [ ] **Step 5: Commit** `feat(notifications): in-app notifications and transactional email`

---

### Task 2: Booking events, reminders and review prompts

**Files:**
- Create: `src/modules/bookings/events.ts`, `src/modules/notifications/booking-handler.ts`
- Modify: `src/modules/bookings/service.ts` (emit after commit in `requestBooking` and `transition`), `src/modules/cron/tick.ts` (reminders + review prompts)
- Test: `tests/integration/notifications/booking-handler.test.ts`, `tests/integration/cron/tick.test.ts` (extend)

**Interfaces:**
- Consumes: `notify` (Task 1); `transition`, `requestBooking`, `runTick` (M1).
- Produces:
  - `type BookingChanged = { bookingId: string; tripId: string; passengerId: string; driverId: string; from: BookingStatus | null; to: BookingStatus; actor: ActorKind }`
  - `emitBookingChanged(e: BookingChanged): Promise<void>` — called **after** the DB transaction commits (never inside it); awaits the handler but catches and logs any error.
  - `handleBookingChanged(e)` mapping: `→ REQUESTED` → driver `BOOKING_REQUESTED`; `→ ACCEPTED` → passenger `BOOKING_ACCEPTED`; `→ REJECTED` → passenger; `→ EXPIRED` → passenger; `→ CANCELLED` → the party who did **not** cancel (`actor` PASSENGER → driver; DRIVER/ADMIN/SYSTEM → passenger); `→ COMPLETED` → nothing here (review prompts come from the tick); `ABANDONED` → nothing.
  - `TickResult` gains `reminded: number` and `prompted: number`; step order: expire, complete (+ review prompts for each newly completed booking, both parties, dedupe `review:<tripId>:<userId>`), re-cancel, reminders (dedupe `reminder:<tripId>:<userId>`).

- [ ] **Step 1: Write failing tests** — accept → passenger gets BOOKING_ACCEPTED (in-app + outbox); passenger cancel → driver notified, not passenger; driver trip-cancel cascade → each passenger notified once; a handler throw does not change the transition's `ok` result; reminders: trip at now+2h10m → driver + accepted passengers reminded once; two concurrent `runTick` calls → one reminder each (Review Focus 3); trip at now+2h20m → none; completion sends REVIEW_PROMPT to both parties once.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm run test:int` — PASS.
- [ ] **Step 5: Commit** `feat(notifications): booking notifications, departure reminders, review prompts`

---

### Task 3: Messages service

**Files:**
- Create: `src/modules/messages/{service,schemas,actions}.ts`, migration `messages`
- Modify: `prisma/schema.prisma` (Message model)
- Test: `tests/integration/messages/service.test.ts`

**Interfaces:**
- Consumes: `notify` (Task 1), `rateLimit`.
- Produces:
  - Prisma `Message { id, bookingId, senderId, body String, createdAt, readAt DateTime? }`, index `(bookingId, createdAt)`.
  - `threadState(booking: { status: BookingStatus; updatedAt: Date }, now?: Date): 'none' | 'open' | 'closed'` — `none` for PENDING_PAYMENT/ABANDONED; `open` for REQUESTED/ACCEPTED and for terminal statuses within 7 days of `updatedAt`; else `closed`.
  - `sendMessage(userId, bookingId, body, now?): Promise<Result<{ id: string }>>` — party check (`NOT_ALLOWED` "You can't message about this booking" for missing *and* foreign bookings — Review Focus 2), state check (`INVALID_STATE` "This conversation has closed"), validation, rate limit (`RATE_LIMITED` "You're sending messages too fast"); then `notify(recipient, 'NEW_MESSAGE', { bookingId, actorName, preview: first 80 chars }, { email: !emailedWithin15Min })`.
  - `listMessages(userId, bookingId, after?: string): Promise<Result<{ messages: { id; senderId; body; createdAt; mine: boolean }[]; state: 'open' | 'closed'; counterpart: { id; name; image } }>>` — ascending, max 50 after the cursor.
  - `markThreadRead(userId, bookingId)` — sets `readAt` on the counterpart's messages.
  - `unreadMessageCounts(userId): Promise<Record<string /* bookingId */, number>>`
  - Actions wrap each with `requireUser`.

- [ ] **Step 1: Write failing tests** — party send/list round trip; stranger and unknown id both → identical `NOT_ALLOWED` result (Review Focus 2); PENDING_PAYMENT → `none`; 7 days + 1 ms after CANCELLED → closed and send refused; 21st message in a minute → RATE_LIMITED; 10 messages in 2 minutes → 10 notifications, 1 email (Review Focus 4); `after` cursor returns only newer messages; markThreadRead affects only the counterpart's messages.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(messages): per-booking message threads`

---

### Task 4: Bell and chat UI

**Files:**
- Create: `src/components/providers/query-provider.tsx`, `src/components/notifications/bell.tsx`, `src/modules/notifications/actions.ts`, `src/components/messages/{thread,composer}.tsx`, `src/app/dashboard/bookings/[id]/messages/page.tsx`
- Modify: `src/app/layout.tsx` (provider), `src/components/layout/auth-area.tsx` (bell when signed in), dashboards (a "Message" link with unread badge on each eligible booking card)
- Test: `tests/unit/components/bell.test.tsx`, `tests/unit/components/thread.test.tsx`, `tests/e2e/messages.spec.ts`

**Interfaces:**
- Consumes: Tasks 1 and 3.
- Produces:
  - `<Bell />` — button "Notifications" with unread count badge (`aria-label="Notifications, 3 unread"`), polls `unreadCountAction` every 30 s; opening shows the latest 20 (title, relative time in IST, link) and calls `markAllReadAction`; empty state "You're all caught up".
  - Thread page `/dashboard/bookings/[id]/messages` (route works for both the passenger and the driver; non-parties → `notFound()`): header with counterpart name/avatar and trip summary; messages oldest→newest, own messages right-aligned in brand tint; polls every 3 s with `after`; composer (textarea, Enter sends, Shift+Enter newline, 1000-char counter, disabled + "This conversation has closed" when closed); marks read on open and on each new batch; keeps scroll pinned to bottom unless the user scrolled up.

- [ ] **Step 1: Write failing tests** — Bell renders the count and accessible label; opening marks read and clears the badge. Thread: appends polled messages without duplicates; own vs other alignment class; closed state disables the composer. E2E: driver publishes, passenger requests and sends "Is there space for a small bag?", driver sees the bell count 1 → opens the thread → replies; passenger sees the reply within 5 s.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test && npm run test:e2e` — PASS.
- [ ] **Step 5: Commit** `feat(messages): notification bell and message threads UI`

---

### Task 5: Email verification

**Files:**
- Create: `src/modules/auth/verify-email.ts`, `src/app/verify-email/page.tsx`
- Modify: `src/modules/auth/actions.ts` (send after sign-up), `src/auth.ts` (Google `email_verified` → `emailVerified`), `src/app/dashboard/profile/page.tsx` ("Verify your email" banner + "Send link again")
- Test: `tests/integration/auth/verify-email.test.ts`

**Interfaces:**
- Consumes: `sendEmail` + verify template (Task 1), `VerificationToken` (M1 schema), `rateLimit`.
- Produces:
  - `createEmailVerification(userId: string, now?: Date): Promise<void>` — deletes the user's older tokens, stores sha256(token), emails the link; rate limit 3/hour (`verify:<userId>`; silently no-op when limited).
  - `consumeEmailVerification(token: string, now?: Date): Promise<Result<void>>` — `INVALID_STATE` "This link has expired. Send a new one from your profile." for unknown, expired or used tokens (Review Focus 5); on success sets `emailVerified = now`, deletes the token.
  - `/verify-email?token=` page shows "Your email is verified" with a link to the profile, or the error copy.
  - Sign-up sends the verification email (failure logged, sign-up still succeeds).

- [ ] **Step 1: Write failing tests** — round trip verifies; reusing the token fails; token at 24 h + 1 ms fails; only the hash is stored (DB value ≠ token); fourth resend within an hour sends nothing.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(auth): email verification links`

---

### Task 6: Seed, docs and checks

**Files:**
- Modify: `prisma/seed.ts` (a few message threads on the demo bookings, unread notifications for the demo driver and passenger, demo accounts marked email-verified), `README.md` (M4 features), `docs/deploy.md` (Resend: create an API key, verify a sending domain or use `onboarding@resend.dev` for testing; env `RESEND_API_KEY`, `EMAIL_FROM`; smoke checks), `.github/workflows/ci.yml` (`EMAIL_PROVIDER=memory`)
- Test: full suites

- [ ] **Step 1:** Extend the seed and docs; add a seed assertion test that the demo passenger has ≥ 1 open thread and ≥ 1 unread notification.
- [ ] **Step 2: Run** `npm run lint && npm run typecheck && npm test && npm run test:int && E2E_SEED=1 npm run test:e2e` twice — PASS.
- [ ] **Step 3: Commit** `feat: M4 seed data and docs`
