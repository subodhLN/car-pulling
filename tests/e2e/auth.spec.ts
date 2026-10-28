import { expect, test } from '@playwright/test';

test('sign up → name in header → log out → log in; protected route redirects', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'longenough1';

  // logged out: protected route bounces to login with next
  await page.goto('/dashboard/trips');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Ftrips$/);

  // sign up
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel(/Mobile number/).fill('98765 43210');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('banner').getByTestId('user-name')).toHaveText('Asha Verma');

  // log out
  await page.getByRole('banner').getByText('Asha Verma').click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Log in' })).toBeVisible();

  // wrong password shows mapped copy
  await page.goto('/login?next=%2Fdashboard%2Ftrips');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();

  // log in again, lands on next
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard\/trips$/);
  await expect(page.getByRole('banner').getByTestId('user-name')).toHaveText('Asha Verma');
});

test('signup shows inline field errors', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('A');
  await page.getByLabel('Email').fill('a@example.com');
  await page.getByLabel('Password').fill('longenough1');
  await page.getByLabel(/Mobile number/).fill('12345');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter a 10-digit Indian mobile number')).toBeVisible();
});

test.describe('login rate limit', () => {
  // Distinct client IP so this does not exhaust the shared "unknown" bucket used by other tests.
  test.use({ extraHTTPHeaders: { 'x-real-ip': `203.0.113.${Math.floor(Math.random() * 250) + 1}` } });
  test('the 11th attempt shows the rate-limit copy', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Password').fill('whatever123');
    for (let i = 0; i < 11; i++) {
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    }
    await expect(page.getByText('Too many attempts. Wait a minute and try again.')).toBeVisible();
  });
});
