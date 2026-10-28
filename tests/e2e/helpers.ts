import { randomInt } from 'node:crypto';
import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * A random private-range client IP. The app keys the auth rate limit (10/min) on x-real-ip (R10), so
 * giving every test context its own address keeps back-to-back runs on a reused dev server from
 * tripping it. The dev server is local; production proxies overwrite this header.
 */
export function uniqueIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

/** `test` whose default context/page use a unique client IP. Override with test.use({ extraHTTPHeaders }). */
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ 'x-real-ip': uniqueIp() });
  },
});
export { expect };

/** A fresh browser context (own cookies, own client IP) and a page in it. Close the context when done. */
export async function newUserContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-real-ip': uniqueIp() } });
  return { context, page: await context.newPage() };
}

/**
 * Navigate and wait for the network to go quiet, so React has hydrated before a form is used. Clicking a
 * submit button earlier makes the browser submit the form natively (a GET that reloads the page).
 */
export async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

export type SignUpInput = { name: string; email: string; password: string; phone?: string };

/** Create an account through the signup form; resolves once signed in on the home page. */
export async function signUp(page: Page, { name, email, password, phone }: SignUpInput): Promise<void> {
  await gotoReady(page, '/signup');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  if (phone) await page.getByLabel(/Mobile number/).fill(phone);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');
}

/** A unique email per call (the dev database keeps users across runs). */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomInt(1e6)}@example.com`;
}

/** Add a car and publish Delhi → Jaipur three days out (₹450, 2 seats) as the signed-in driver. Resolves to the trip path. */
export const istDate = (daysOut: number) =>
  new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

export async function publishTrip(
  page: Page,
  { daysOut = 3, time = '09:00', addCar = true }: { daysOut?: number; time?: string; addCar?: boolean } = {},
): Promise<string> {
  if (addCar) {
  await gotoReady(page, '/dashboard/vehicles');
  await page.getByLabel('Make').fill('Maruti');
  await page.getByLabel('Model').fill('Ertiga');
  await page.getByLabel('Colour').fill('White');
  await page.getByLabel('Passenger seats').selectOption('4');
  await page.getByRole('button', { name: 'Add car' }).click();
  await expect(page.getByText('Maruti Ertiga · White · 4 passenger seats')).toBeVisible();
  }

  await gotoReady(page, '/trips/new');
  const from = page.getByRole('combobox', { name: 'From' });
  await from.pressSequentially('Delh');
  await expect(page.getByRole('option').first()).toBeVisible();
  await from.press('ArrowDown');
  await from.press('Enter');
  const to = page.getByRole('combobox', { name: 'To' });
  await to.pressSequentially('Jaip');
  await expect(page.getByRole('option').first()).toBeVisible();
  await to.press('ArrowDown');
  await to.press('Enter');
  await page.getByLabel('Date').fill(istDate(daysOut));
  await page.getByLabel('Departure time (IST)').fill(time);
  await page.getByLabel('Seats offered').selectOption('2');
  await page.getByLabel('Price per seat (₹)').fill('450');
  await page.getByRole('button', { name: 'Publish trip' }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);
  return new URL(page.url()).pathname;
}
