import { expect, test } from '@playwright/test';

const istDate = (daysOut: number) =>
  new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const driverName = `Searchable ${Date.now()}`; // unique: the dev database accumulates trips across runs

test('search finds a published ride; filters keep it; an empty day shows the empty state', async ({ page, browser }) => {
  // A driver signs up, adds a car and publishes Delhi → Jaipur three days out.
  await page.goto('/signup');
  await page.getByLabel('Full name').fill(driverName);
  await page.getByLabel('Email').fill(`search-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('longenough1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/dashboard/vehicles');
  await page.getByLabel('Make').fill('Maruti');
  await page.getByLabel('Model').fill('Ertiga');
  await page.getByLabel('Colour').fill('White');
  await page.getByLabel('Passenger seats').selectOption('4');
  await page.getByRole('button', { name: 'Add car' }).click();
  await expect(page.getByText('Maruti Ertiga · White · 4 passenger seats')).toBeVisible();

  await page.goto('/trips/new');
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
  const date = istDate(3);
  await page.getByLabel('Date').fill(date);
  await page.getByLabel('Departure time (IST)').fill('09:00');
  await page.getByLabel('Seats offered').selectOption('1');
  await page.getByLabel('Price per seat (₹)').fill('450');
  await page.getByRole('button', { name: 'Publish trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[^/]+$/);

  // A fresh visitor (no session) searches.
  const ctx = await browser.newContext();
  const visitor = await ctx.newPage();
  await visitor.goto(`/search?from=delhi&to=jaipur&date=${date}`);
  await expect(visitor.getByRole('heading', { level: 1 })).toContainText('Delhi to Jaipur,');
  await expect(visitor.getByText('rides · sorted by departure').or(visitor.getByText('ride · sorted by departure'))).toBeVisible();
  const row = visitor.getByRole('link', { name: new RegExp(driverName) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('₹450');
  await expect(row).toContainText('1 seat left');
  await expect(row).toContainText('09:00');

  await visitor.getByLabel('Radius').selectOption('25');
  await expect(visitor).toHaveURL(/radius=25/);
  await expect(visitor.getByRole('link', { name: new RegExp(driverName) })).toBeVisible();
  await visitor.getByLabel('Sort by').selectOption('price');
  await expect(visitor).toHaveURL(/sort=price/);
  await expect(visitor.getByText('sorted by price')).toBeVisible();
  await expect(visitor.getByRole('link', { name: new RegExp(driverName) })).toBeVisible();

  // A day with no rides shows the empty state.
  await visitor.goto(`/search?from=delhi&to=jaipur&date=${istDate(40)}`);
  await expect(visitor.getByText('No rides on this day yet — try the next day or widen the area')).toBeVisible();
  await expect(visitor.getByRole('link', { name: 'Try next day' })).toBeVisible();

  // Missing places show the prompt.
  await visitor.goto('/search');
  await expect(visitor.getByText("Choose where you're leaving from and going to")).toBeVisible();
  await ctx.close();
});
