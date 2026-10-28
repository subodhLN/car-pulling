import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('home loads inside the shell', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/RideShare/);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Photo credits' })).toHaveAttribute(
      'href',
      '/credits',
    );
  });

  test('unknown route renders the not-found page with a link home', async ({ page }) => {
    const res = await page.goto('/does-not-exist');
    expect(res?.status()).toBe(404);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(main.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
  });

  test('header shows Find a ride and Offer a ride', async ({ page }) => {
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Find a ride' })).toHaveAttribute('href', '/search');
    await expect(header.getByRole('link', { name: 'Offer a ride' }).first()).toHaveAttribute(
      'href',
      '/trips/new',
    );
    await expect(header.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  test('clicking the theme toggle twice sets dark theme', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /theme/i });
    await toggle.click(); // system -> light
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click(); // light -> dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // choice survives a reload without flashing back
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('no element has a running animation', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      // Hovering a button would start its hover transition; with reduced motion it must not.
      await page.getByRole('main').getByRole('link', { name: 'Find a ride' }).hover();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    });
  });
});
