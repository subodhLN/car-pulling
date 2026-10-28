# Deploying RideShare (Vercel + Neon)

RideShare runs on Vercel with a Neon Postgres database (PostGIS included). Nothing here has been deployed yet: follow these steps with your own Vercel and Neon accounts.

## 1. Create the project and database

1. Push the repository to GitHub and import it in Vercel (**Add New... > Project**). Framework preset: Next.js.
2. In the Vercel project open the **Storage** tab, choose **Neon** from the Marketplace and create a database. Vercel adds the connection strings to the project's environment variables. Check that you end up with a pooled URL (host contains `-pooler`) and a direct URL (no `-pooler`).
3. PostGIS needs no manual step: the first migration runs `CREATE EXTENSION IF NOT EXISTS postgis`.

## 2. Environment variables

Set these in Vercel under **Settings > Environment Variables** (Production, and Preview if you use it):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The **pooled** Neon URL (used by the running app) |
| `DIRECT_URL` | The **direct** (non-pooled) Neon URL (used by `prisma migrate deploy`) |
| `AUTH_SECRET` | A random string: `openssl rand -base64 32` |
| `CRON_SECRET` | A random string; the cron endpoint requires `Authorization: Bearer $CRON_SECRET` |
| `NEXT_PUBLIC_APP_URL` | Your public URL, e.g. `https://your-app.vercel.app` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Optional. Enables "Continue with Google". |
| `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS` | Optional. Set to `false` to hide the demo-accounts panel on `/login` (shown by default). |

`AUTH_TRUST_HOST` is not needed on Vercel (it is only for local and self-hosted runs).

For Google sign-in, create an OAuth client in Google Cloud Console and add the authorized redirect URI `https://<your-app>/api/auth/callback/google`.

## 3. Build command

Set the Vercel **Build Command** to `npm run vercel-build` (Settings > Build and Deployment, or leave it empty: Vercel uses the `vercel-build` script when present). It runs `prisma migrate deploy && next build`, so every deploy applies pending migrations first. Prisma uses `DIRECT_URL` for migrations.

## 4. Seed the database once

Seeding runs from your own machine against Neon's **direct** URL. The seed wipes all data first, so run it only on a fresh database:

```bash
DATABASE_URL='<direct neon url>' DIRECT_URL='<direct neon url>' SEED_ALLOW=1 npm run db:seed
```

(`SEED_ALLOW=1` is only needed if `NODE_ENV=production` is set in your shell.) This creates the demo accounts `driver@demo.test`, `passenger@demo.test` and `admin@demo.test`, all with password `demo-ride-2026`. Do not re-run it after real users have signed up, and set `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false` for a real launch.

## 5. Cron tick

`/api/cron/tick` expires stale requests, completes finished trips and re-cancels bookings stuck on cancelled trips. It should run every 15 minutes, but Vercel's Hobby plan rejects crons more frequent than daily, so there are two schedulers:

- **Vercel cron** (`vercel.json`): a daily fallback, `0 3 * * *` UTC.
- **GitHub Actions** (`.github/workflows/cron-tick.yml`): every 15 minutes. Add two repository secrets under **GitHub repo > Settings > Secrets and variables > Actions > New repository secret**:
  - `APP_URL`: your public URL with no trailing slash, e.g. `https://your-app.vercel.app`
  - `CRON_SECRET`: the same value as the Vercel env var

  Without these secrets the workflow prints a notice and exits successfully. You can also run it by hand from the **Actions** tab (**Run workflow**). GitHub may delay scheduled runs by several minutes.

## 6. Smoke test

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
