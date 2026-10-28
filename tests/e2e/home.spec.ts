import type { Page } from '@playwright/test';
import { expect, newUserContext, signUp, test, uniqueEmail } from './helpers';

const istDate = (daysOut: number) =>
  new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function pickCity(page: Page, name: string, typed: string) {
  const box = page.getByRole('combobox', { name });
  await box.pressSequentially(typed);
  await expect(page.getByRole('option').first()).toBeVisible();
  await box.press('ArrowDown');
  await box.press('Enter');
}

test('home shows the hero, four popular route cards and the trust section', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Someone’s already driving your way.' })).toBeVisible();

  const popular = page.getByRole('region', { name: 'Popular this weekend' });
  const cards = popular.getByRole('listitem').getByRole('link');
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    await expect(card).toHaveAttribute('href', /^\/search\?from=[a-z-]+&to=[a-z-]+&date=\d{4}-\d{2}-\d{2}(&radius=25)?$/);
    const badge = (await card.textContent()) ?? '';
    if (/\d+ rides?/.test(badge)) await expect(card).toHaveAttribute('href', /&radius=25$/);
    await expect(card).toHaveAccessibleName(/^\S.* to \S.*/);
    const img = card.getByRole('img');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }

  await expect(page.getByRole('heading', { level: 2, name: 'Travel with people, not strangers.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Photo credits' })).toBeVisible();
});

test('the search bar lands on /search with the published ride', async ({ page, browser }) => {
  const driverName = `Home Driver ${Date.now()}`;
  await signUp(page, { name: driverName, email: uniqueEmail('home'), password: 'longenough1' });
  await page.goto('/dashboard/vehicles');
  await page.getByLabel('Make').fill('Hyundai');
  await page.getByLabel('Model').fill('Creta');
  await page.getByLabel('Colour').fill('White');
  await page.getByLabel('Passenger seats').selectOption('4');
  await page.getByRole('button', { name: 'Add car' }).click();
  await expect(page.getByText('Hyundai Creta · White · 4 passenger seats')).toBeVisible();

  await page.goto('/trips/new');
  await pickCity(page, 'From', 'Delh');
  await pickCity(page, 'To', 'Jaip');
  const date = istDate(3);
  await page.getByLabel('Date').fill(date);
  await page.getByLabel('Departure time (IST)').fill('07:30');
  await page.getByLabel('Seats offered').selectOption('3');
  await page.getByLabel('Price per seat (₹)').fill('430');
  await page.getByRole('button', { name: 'Publish trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[^/]+$/);

  const { context, page: visitor } = await newUserContext(browser);
  await visitor.goto('/');
  const form = visitor.getByRole('search', { name: 'Find a ride' });
  await pickCity(visitor, 'Leaving from', 'Delh');
  await pickCity(visitor, 'Going to', 'Jaip');
  await form.getByLabel('When').fill(date);
  await form.getByLabel('Seats').selectOption('2');
  await form.getByRole('button', { name: 'Search' }).click();

  await expect(visitor).toHaveURL(new RegExp(`/search\\?from=delhi&to=jaipur&date=${date}&seats=2`));
  await expect(visitor.getByRole('heading', { level: 1 })).toContainText('Delhi to Jaipur,');
  await expect(visitor.getByRole('link', { name: new RegExp(driverName) })).toBeVisible();
  await context.close();
});

test('the search bar asks for both places before searching', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('search', { name: 'Find a ride' }).getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('alert').filter({ hasText: "Choose where you're leaving from and going to" })).toBeVisible();
  await expect(page).toHaveURL('/');
});

test.describe('on a 400 px phone', () => {
  test.use({ viewport: { width: 400, height: 860 } });

  test('nothing scrolls sideways and the search bar is usable', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Popular this weekend' }).getByRole('listitem')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
    const form = page.getByRole('search', { name: 'Find a ride' });
    for (const label of ['Leaving from', 'Going to', 'When', 'Seats']) {
      await expect(form.getByLabel(label)).toBeVisible();
    }
    await expect(form.getByRole('button', { name: 'Search' })).toBeInViewport();
  });
});

test('credits lists every photo with an Unsplash link', async ({ page }) => {
  await page.goto('/credits');
  await expect(page.getByRole('heading', { level: 1, name: 'Photo credits' })).toBeVisible();
  await expect(page.getByRole('link', { name: /View original on Unsplash/ })).toHaveCount(6);
  for (const link of await page.getByRole('link', { name: /View original on Unsplash/ }).all()) {
    await expect(link).toHaveAttribute('href', /^https:\/\/images\.unsplash\.com\/photo-[\w-]+$/);
  }
  await expect(page.getByText(/used under the/)).toContainText('Unsplash License');
  await expect(page.getByText('Jaipur — Amer Fort', { exact: true })).toBeVisible();
});
