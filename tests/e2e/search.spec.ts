import { expect, gotoReady, newUserContext, signUp, test, uniqueEmail } from './helpers';

const istDate = (daysOut: number) =>
  new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

// The dev database accumulates Delhi → Jaipur trips (and the seed adds more), and results are capped at 20 per
// page, so publish on a random quiet day at a random early-morning minute to stay on page 1.
const daysOut = 4 + Math.floor(Math.random() * 10);
const departureTime = `0${Math.floor(Math.random() * 6)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
const driverName = `Searchable ${Date.now()}`; // unique: the dev database accumulates trips across runs

test('search finds a published ride; filters keep it; an empty day shows the empty state', async ({ page, browser }) => {
  // A driver signs up, adds a car and publishes Delhi → Jaipur a few days out.
  await signUp(page, { name: driverName, email: uniqueEmail('search'), password: 'longenough1' });

  await gotoReady(page, '/dashboard/vehicles');
  await page.getByLabel('Make').fill('Maruti');
  await page.getByLabel('Model').fill('Ertiga');
  await page.getByLabel('Colour').fill('White');
  await page.getByLabel('Passenger seats').selectOption('4');
  await page.getByRole('button', { name: 'Add car' }).click();
  await expect(page.getByText('Maruti Ertiga · White · 4 passenger seats')).toBeVisible();

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
  const date = istDate(daysOut);
  await page.getByLabel('Date').fill(date);
  await page.getByLabel('Departure time (IST)').fill(departureTime);
  await page.getByLabel('Seats offered').selectOption('1');
  await page.getByLabel('Price per seat (₹)').fill('450');
  await page.getByRole('button', { name: 'Publish trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[^/]+$/);

  // A fresh visitor (no session) searches.
  const { context: ctx, page: visitor } = await newUserContext(browser);
  await gotoReady(visitor, `/search?from=delhi&to=jaipur&date=${date}`);
  await expect(visitor.getByRole('heading', { level: 1 })).toContainText('Delhi to Jaipur,');
  await expect(visitor.getByText('rides · sorted by departure').or(visitor.getByText('ride · sorted by departure'))).toBeVisible();
  const row = visitor.getByRole('link', { name: new RegExp(driverName) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('₹450');
  await expect(row).toContainText('1 seat left');
  await expect(row).toContainText(departureTime);

  await visitor.getByLabel('Radius').selectOption('25');
  await expect(visitor).toHaveURL(/radius=25/);
  await expect(visitor.getByRole('link', { name: new RegExp(driverName) })).toBeVisible();
  await visitor.getByLabel('Sort by').selectOption('price');
  await expect(visitor).toHaveURL(/sort=price/);
  await expect(visitor.getByText('sorted by price')).toBeVisible();
  await expect(visitor.getByRole('link', { name: new RegExp(driverName) })).toBeVisible();

  // A day with no rides shows the empty state.
  await gotoReady(visitor, `/search?from=delhi&to=jaipur&date=${istDate(40)}`);
  await expect(visitor.getByText('No rides on this day yet — try the next day or widen the area')).toBeVisible();
  await expect(visitor.getByRole('link', { name: 'Try next day' })).toBeVisible();
  const searchForm = visitor.getByRole('form', { name: 'Search rides' });
  await expect(searchForm.getByLabel('Date')).toHaveValue(istDate(40));
  // In-page navigation must reset the search form to the new query, even after the visitor edited a field
  // without searching (the form used to keep its old state).
  await searchForm.getByLabel('Date').fill(istDate(45));
  await visitor.getByRole('link', { name: 'Try next day' }).click();
  await expect(visitor).toHaveURL(new RegExp(`date=${istDate(41)}`));
  await expect(searchForm.getByLabel('Date')).toHaveValue(istDate(41));

  // Missing places show the prompt.
  await visitor.goto('/search');
  await expect(visitor.getByText("Choose where you're leaving from and going to")).toBeVisible();
  await ctx.close();
});
