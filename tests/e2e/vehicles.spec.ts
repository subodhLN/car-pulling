import { expect, test } from '@playwright/test';

test('add a car, see it listed, delete with confirm', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Ravi Nair');
  await page.getByLabel('Email').fill(`veh-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('longenough1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/dashboard/vehicles');
  await expect(page.getByRole('link', { name: 'Cars' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText("Add the car you'll drive so you can offer rides.")).toBeVisible();

  // inline validation
  await page.getByRole('button', { name: 'Add car' }).click();
  await expect(page.getByText('Enter the make')).toBeVisible();

  await page.getByLabel('Make').fill('Maruti');
  await page.getByLabel('Model').fill('Ertiga');
  await page.getByLabel('Colour').fill('White');
  await page.getByLabel('Passenger seats').selectOption('4');
  await page.getByRole('button', { name: 'Add car' }).click();

  const item = page.getByRole('listitem').filter({ hasText: 'Maruti Ertiga · White · 4 passenger seats' });
  await expect(item).toBeVisible();
  await expect(page.getByText("Add the car you'll drive so you can offer rides.")).toHaveCount(0);

  await item.getByRole('button', { name: 'Delete' }).click();
  await item.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText("Add the car you'll drive so you can offer rides.")).toBeVisible();
});
