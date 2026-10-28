import { expect, gotoReady, test } from './helpers';

// A completed ride can't be produced through the UI (trips can't be published in the past), so this spec
// relies on the seed: passenger@demo.test has a completed ride with the demo driver they haven't rated.
test.skip(process.env.E2E_SEED !== '1', 'needs seeded demo accounts (run with E2E_SEED=1)');

const reviewCount = async (text: string | null) => Number(/\((\d+)\)/.exec(text ?? '')?.[1] ?? 0);

test('a passenger rates their driver and the review shows on the driver profile', async ({ page }) => {
  await gotoReady(page, '/login');
  await page.getByLabel('Email').fill('passenger@demo.test');
  await page.getByLabel('Password').fill('demo-ride-2026');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/');

  await gotoReady(page, '/dashboard/bookings');
  const form = page.getByRole('form', { name: 'Rate Rohan Mehta' });
  await expect(form).toBeVisible();

  // The driver's review count before posting.
  const profileHref = await page.getByRole('link', { name: 'Rohan Mehta' }).first().getAttribute('href');
  expect(profileHref).toMatch(/^\/users\//);
  const profile = await page.context().newPage();
  await profile.goto(profileHref!);
  const before = await reviewCount(await profile.getByTitle(/^Rated /).textContent());
  await profile.close();

  const comment = `Lovely ride, thanks Rohan ${Date.now()}`;
  await form.getByRole('radio', { name: '5 stars' }).click();
  await form.getByLabel('Comment (optional)').fill(comment);
  await form.getByRole('button', { name: 'Post review' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thanks — your review is posted' })).toBeVisible();

  await page.goto(profileHref!);
  await expect(page.getByRole('heading', { level: 1, name: 'Rohan Mehta' })).toBeVisible();
  await expect(page.getByText(comment)).toBeVisible();
  expect(await reviewCount(await page.getByTitle(/^Rated /).textContent())).toBe(before + 1);
});
