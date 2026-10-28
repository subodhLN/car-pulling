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

export type SignUpInput = { name: string; email: string; password: string; phone?: string };

/** Create an account through the signup form; resolves once signed in on the home page. */
export async function signUp(page: Page, { name, email, password, phone }: SignUpInput): Promise<void> {
  await page.goto('/signup');
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
