import { expect, gotoReady, istDate, publishTrip, signUp, test, uniqueEmail } from './helpers';

// A quiet random day so this run's two trips are the only results on page 1.
const daysOut = 15 + Math.floor(Math.random() * 30);

test('trip and search pages show route maps that follow the focused ride and the theme', async ({ page }) => {
  await signUp(page, { name: `Mapper ${Date.now()}`, email: uniqueEmail('maps'), password: 'longenough1' });
  const first = await publishTrip(page, { daysOut, time: '01:10' });
  const second = await publishTrip(page, { daysOut, time: '01:40', addCar: false });

  // "Choose on map…" returns focus to its picker when the dialog closes.
  await gotoReady(page, '/trips/new');
  const from = page.getByRole('combobox', { name: 'From' });
  await from.pressSequentially('De');
  await page.getByRole('option', { name: 'Choose on map…' }).click();
  await expect(page.getByRole('dialog', { name: 'Choose on map' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'From' })).toBeFocused();

  // Trip page: the stored (fake) route is drawn.
  await gotoReady(page, first);
  await expect(page.getByTestId('route-map')).toHaveAttribute('data-route-state', 'drawn');
  await expect(page.getByText(/^Pickup at Delhi/)).toBeVisible();
  // The map container must fill its frame (MapLibre's own CSS sets position: relative on it).
  const box = await page.getByTestId('route-map').boundingBox();
  expect(box!.height).toBeGreaterThan(200);

  // Search page: the first listed result is shown (the dev database may hold rides from earlier runs);
  // focusing another ride switches the map.
  await gotoReady(page, `/search?from=delhi&to=jaipur&date=${istDate(daysOut)}`);
  const map = page.getByTestId('search-map');
  const firstListed = (await page
    .locator('section[aria-labelledby="results-heading"] ul a[href^="/trips/"]')
    .first()
    .getAttribute('href'))!;
  await expect(map).toHaveAttribute('data-selected-trip', firstListed.split('/').pop()!);
  await page.locator(`a[href="${firstListed === second ? first : second}"]`).focus();
  await expect(map).toHaveAttribute('data-selected-trip', (firstListed === second ? first : second).split('/').pop()!);
  await expect(page.getByTestId('route-map')).toHaveAttribute('data-route-state', 'drawn');

  // Theme switch keeps the route (map re-styled, layers re-added).
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(page.getByTestId('route-map')).toHaveAttribute('data-route-state', 'drawn');
});

test('phones get a "Show map" toggle and no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await gotoReady(page, `/search?from=delhi&to=jaipur&date=${istDate(daysOut)}`);
  const toggle = page.getByRole('button', { name: 'Show map' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Hide map' })).toBeVisible();
  await expect(page.getByTestId('route-map')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
});
