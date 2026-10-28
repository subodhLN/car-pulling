/**
 * Regenerates docs/screenshots/*.png from a seeded dev database (README images).
 *
 *   npm run db:seed && npm run dev      # in another terminal
 *   npx tsx scripts/screenshots.ts
 *
 * Uses the demo accounts, so it only works against seeded data.
 */
import { mkdir } from 'node:fs/promises';
import { chromium, type Browser, type Page } from '@playwright/test';
import { db } from '@/lib/db';
import { DEMO_PASSWORD } from '@/modules/auth/demo-accounts';

try {
  process.loadEnvFile('.env');
} catch {
  // rely on the real environment
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = 'docs/screenshots';

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(`${BASE}/`);
}

/** Screenshot with the Next.js dev badge hidden. */
async function shot(page: Page, file: string) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.screenshot({ path: `${OUT}/${file}` });
}

async function context(browser: Browser, opts: { width: number; height: number; scheme: 'light' | 'dark'; ip: string }) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    colorScheme: opts.scheme,
    deviceScaleFactor: 1,
    extraHTTPHeaders: { 'x-real-ip': opts.ip },
  });
  return { ctx, page: await ctx.newPage() };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  // A seeded upcoming Delhi → Jaipur trip, and its IST date for the search page.
  const [trip] = await db.$queryRaw<{ id: string; day: string }[]>`
    SELECT t."id", to_char(t."departureAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day
    FROM "Trip" t WHERE t."originLabel" = 'Delhi' AND t."destLabel" = 'Jaipur'
      AND t."status" = 'PUBLISHED' AND t."departureAt" > now() + interval '3 hours'
    ORDER BY t."departureAt" LIMIT 1`;
  if (!trip) throw new Error('No seeded Delhi → Jaipur trip; run npm run db:seed first.');

  const browser = await chromium.launch();
  try {
    const desktop = await context(browser, { width: 1280, height: 800, scheme: 'light', ip: '10.9.0.1' });
    await desktop.page.goto(BASE);
    await desktop.page.waitForLoadState('networkidle');
    await shot(desktop.page, 'home-desktop-light.png');
    await login(desktop.page, 'passenger@demo.test');
    await desktop.page.goto(`${BASE}/search?from=delhi&to=jaipur&date=${trip.day}`);
    await desktop.page.waitForLoadState('networkidle');
    await shot(desktop.page, 'search-results.png');
    await desktop.page.goto(`${BASE}/trips/${trip.id}`);
    await desktop.page.waitForLoadState('networkidle');
    await shot(desktop.page, 'trip-page.png');
    await desktop.ctx.close();

    const driver = await context(browser, { width: 1280, height: 900, scheme: 'light', ip: '10.9.0.2' });
    await login(driver.page, 'driver@demo.test');
    await driver.page.goto(`${BASE}/dashboard/trips`);
    await driver.page.waitForLoadState('networkidle');
    await shot(driver.page, 'driver-dashboard.png');
    await driver.ctx.close();

    const mobile = await context(browser, { width: 390, height: 844, scheme: 'dark', ip: '10.9.0.3' });
    await mobile.page.goto(BASE);
    await mobile.page.waitForLoadState('networkidle');
    await shot(mobile.page, 'home-mobile-dark.png');
    await mobile.ctx.close();
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
