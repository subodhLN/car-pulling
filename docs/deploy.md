# Deploying RideShare (Vercel + Neon)

RideShare runs on Vercel with a Neon Postgres database (PostGIS included). Nothing here has been deployed yet: follow these steps with your own Vercel and Neon accounts.

## 1. Create the project and database

1. Push the repository to GitHub and import it in Vercel (**Add New... > Project**). Framework preset: Next.js.
2. In the Vercel project open the **Storage** tab, choose **Neon** from the Marketplace and create a database. Vercel adds the connection strings to the project's environment variables. The integration provides the pooled `DATABASE_URL` (host contains `-pooler`) and the unpooled `DATABASE_URL_UNPOOLED`. Older integrations name them `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING`.
3. PostGIS needs no manual step: the first migration runs `CREATE EXTENSION IF NOT EXISTS postgis`.

## 2. Environment variables

Set these in Vercel under **Settings > Environment Variables** for **Production**. Preview deploys need their own database (see the note below the table):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The **pooled** Neon URL (used by the running app) |
| `DIRECT_URL` | The **unpooled** Neon URL: copy the value of `DATABASE_URL_UNPOOLED` (or `POSTGRES_URL_NON_POOLING`). Used by `prisma migrate deploy`. Set it for **Production only**, **before the first deploy**: the production build fails at `prisma migrate deploy` if it is missing. |
| `AUTH_SECRET` | A random string: `openssl rand -base64 32` |
| `CRON_SECRET` | A random string; the cron endpoint requires `Authorization: Bearer $CRON_SECRET` |
| `NEXT_PUBLIC_APP_URL` | Your public URL, e.g. `https://your-app.vercel.app` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Optional. Enables "Continue with Google". |
| `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS` | Optional. Set to `false` to hide the demo-accounts panel on `/login` (shown by default). |
| `GEO_PROVIDER` | Leave **unset** in production (live Photon place search + OSRM routing). `fake` is for tests and CI only. |
| `NEXT_PUBLIC_MAP_TILES` | Leave **unset** (map tiles on). `off` is for tests and CI only. |

**Preview deploys:** never give Preview the production `DATABASE_URL` or `DIRECT_URL`. Either enable Neon's preview-branch integration (each Preview deploy gets its own Neon branch and connection strings), or create a separate database and set its pooled URL as `DATABASE_URL` for the Preview environment (Preview does not need `DIRECT_URL`). Preview builds never run migrations (see step 3), so a separate Preview database must be migrated by hand: `DIRECT_URL='<preview direct url>' DATABASE_URL='<preview direct url>' npx prisma migrate deploy`.

`AUTH_TRUST_HOST` is not needed on Vercel (it is only for local and self-hosted runs).

For Google sign-in, create an OAuth client in Google Cloud Console and add the authorized redirect URI `https://<your-app>/api/auth/callback/google`.

## 3. Build command

Set the Vercel **Build Command** to `npm run vercel-build` (Settings > Build and Deployment, or leave it empty: Vercel uses the `vercel-build` script when present). It runs `scripts/vercel-build.mjs`, which always runs `prisma generate` (Vercel caches `node_modules`, so the client must be regenerated after schema changes), runs `prisma migrate deploy` **only when `VERCEL_ENV=production`** (other environments log `Skipping prisma migrate deploy on <env>`), then `next build`. Prisma uses `DIRECT_URL` for migrations.

## 4. Seed the database once

Seeding runs from your own machine against Neon's unpooled URL. The seed wipes all data first, so run it only on a fresh database:

```bash
DATABASE_URL='<direct neon url>' DIRECT_URL='<direct neon url>' SEED_ALLOW=1 npm run db:seed
```

`SEED_ALLOW=1` is required because the target is not a local database; the seed prints the host and database name before it wipes anything. This creates the demo accounts `driver@demo.test`, `passenger@demo.test` and `admin@demo.test`, all with password `demo-ride-2026`. Do not re-run it after real users have signed up, and set `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false` for a real launch.

The demo panel also exposes `admin@demo.test`. In M1 the admin account has no extra powers: it cannot act on other people's bookings or trips (admin tooling arrives in M6), but set `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false` and/or delete the demo accounts before M6 ships.

## 5. Maps (M2)

Place search uses the public [Photon](https://photon.komoot.io) instance, routes use the public [OSRM](https://project-osrm.org) demo server and map tiles come from [OpenFreeMap](https://openfreemap.org). All are free and need no keys. The public Photon and OSRM servers are meant for light use, which fits a portfolio demo; results are cached in the `GeoCache` table (places 24 h, routes 30 days) and searches are limited to 30 a minute per user. For real traffic, self-host them and change the base URLs in `src/modules/geo/providers/photon.ts` and `osrm.ts`.

If any trips were published before M2 (or while OSRM was down) they have no stored route and show a dashed straight line. Fill them in once after deploying M2, from your machine:

```bash
DATABASE_URL='<direct neon url>' DIRECT_URL='<direct neon url>' npm run routes:backfill
```

It makes one OSRM request per trip, one second apart. The seed needs no network: it uses the precomputed routes in `prisma/seed-routes.json` (regenerate with `npm run seed:routes` if you change the seed corridors).

## 6. Cron tick

`/api/cron/tick` expires stale requests, completes finished trips and re-cancels bookings stuck on cancelled trips. It should run every 15 minutes, but Vercel's Hobby plan rejects crons more frequent than daily, so there are two schedulers:

- **Vercel cron** (`vercel.json`): a daily fallback, `0 3 * * *` UTC.
- **GitHub Actions** (`.github/workflows/cron-tick.yml`): every 15 minutes. Add two repository secrets under **GitHub repo > Settings > Secrets and variables > Actions > New repository secret**:
  - `APP_URL`: your public URL with no trailing slash, e.g. `https://your-app.vercel.app`
  - `CRON_SECRET`: the same value as the Vercel env var

  Without these secrets the workflow prints a notice and exits successfully. You can also run it by hand from the **Actions** tab (**Run workflow**). GitHub may delay scheduled runs by several minutes, and disables scheduled workflows after 60 days without repository activity (re-enable it from the Actions tab).

## 7. Smoke test

After the first deploy and seed, on the live URL:

- [ ] Home renders with photos and the four popular routes
- [ ] `/login` shows the demo accounts panel; **Use** on the driver fills the form and logs in
- [ ] `/dashboard/trips` as `driver@demo.test` shows upcoming trips with pending requests
- [ ] As `passenger@demo.test`: `/dashboard/bookings` shows one Accepted and one Requested booking
- [ ] Search Delhi to Jaipur on a day with a trip; open it and request a seat
- [ ] As the driver, accept the request; the passenger then sees the driver's phone number
- [ ] `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/tick` returns JSON
- [ ] The same URL without the header is rejected
- [ ] Run the **Cron tick** workflow manually in GitHub Actions and confirm it succeeds
- [ ] Sign up a new account and publish a trip end to end
- [ ] Place search finds a place that is not one of the ten cities (e.g. "Hawa Mahal"); "Choose on map…" drops a pin and names it
- [ ] The trip page shows the road route on a styled map, in light and dark themes
- [ ] On search results, hovering a ride switches the map to its route
- [ ] As `passenger@demo.test`, rate a completed ride from `/dashboard/bookings`: "Thanks — your review is posted"
- [ ] Open a driver's profile from the trip page ("View profile"): rating, badges and reviews show, and no email or phone
