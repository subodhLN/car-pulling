import { expect, gotoReady, test } from './helpers';

// The demo accounts exist only after `npm run db:seed`. Run with E2E_SEED=1 and tests/e2e/global-setup.ts
// reseeds the dev database first; without it this spec is skipped.
test.skip(process.env.E2E_SEED !== '1', 'needs seeded demo accounts (run with E2E_SEED=1)');

test('demo account button fills the login form and signs in', async ({ page }) => {
  await gotoReady(page, '/login');
  await expect(page.getByText('Demo password: demo-ride-2026')).toBeVisible();
  await page.getByRole('button', { name: 'Use driver demo account' }).click();
  await expect(page.getByLabel('Email')).toHaveValue('driver@demo.test');
  await expect(page.getByLabel('Password')).toHaveValue('demo-ride-2026');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/');

  // The seeded driver has upcoming trips with pending requests.
  await page.goto('/dashboard/trips');
  await expect(page.getByRole('button', { name: /^Accept / }).first()).toBeVisible();
});
