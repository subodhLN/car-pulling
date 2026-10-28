import { expect, signUp, test, uniqueEmail } from './helpers';

test('publish a trip with keyboard-driven city pickers', async ({ page }) => {
  await signUp(page, { name: 'Meera Iyer', email: uniqueEmail('pub'), password: 'longenough1' });

  // No car yet: the form is replaced by a pointer to the cars page.
  await page.goto('/trips/new');
  await expect(page.getByRole('link', { name: 'Add a car' })).toHaveAttribute('href', '/dashboard/vehicles');

  await page.goto('/dashboard/vehicles');
  await page.getByLabel('Make').fill('Maruti');
  await page.getByLabel('Model').fill('Ertiga');
  await page.getByLabel('Colour').fill('White');
  await page.getByLabel('Passenger seats').selectOption('4');
  await page.getByRole('button', { name: 'Add car' }).click();
  await expect(page.getByText('Maruti Ertiga · White · 4 passenger seats')).toBeVisible();

  await page.goto('/trips/new');
  const from = page.getByRole('combobox', { name: 'From' });
  await from.click();
  await from.pressSequentially('Delh');
  await expect(page.getByRole('option').first()).toBeVisible();
  await expect(from).toHaveAttribute('aria-expanded', 'true');
  await from.press('ArrowDown');
  await from.press('Enter');
  await expect(from).toHaveValue('Delhi');

  const to = page.getByRole('combobox', { name: 'To' });
  await to.pressSequentially('Jaip');
  await expect(page.getByRole('option').first()).toBeVisible();
  await to.press('ArrowDown');
  await to.press('Enter');
  await expect(to).toHaveValue('Jaipur');

  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000); // IST calendar date
  await page.getByLabel('Date').fill(d.toISOString().slice(0, 10));
  await page.getByLabel('Departure time (IST)').fill('09:00');
  await page.getByLabel('Seats offered').selectOption('2');
  await page.getByLabel('Price per seat (₹)').fill('450');
  await page.getByRole('button', { name: 'Publish trip' }).click();

  await expect(page).toHaveURL(/\/trips\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Delhi');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Jaipur');
  await expect(page.getByText('₹450')).toBeVisible();
  await expect(page.getByText('2 seats left')).toBeVisible();
  await expect(page.getByText('9:00 AM')).toBeVisible();
});
