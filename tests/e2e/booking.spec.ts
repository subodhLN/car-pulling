import type { Page } from '@playwright/test';
import { expect, newUserContext, signUp, test, uniqueEmail } from './helpers';

const istDate = (daysOut: number) =>
  new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function publishTrip(page: Page): Promise<string> {
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
  await page.getByLabel('Date').fill(istDate(3));
  await page.getByLabel('Departure time (IST)').fill('09:00');
  await page.getByLabel('Seats offered').selectOption('2');
  await page.getByLabel('Price per seat (₹)').fill('450');
  await page.getByRole('button', { name: 'Publish trip' }).click();
  await expect(page).toHaveURL(/\/trips\/(?!new$)[^/]+$/);
  return new URL(page.url()).pathname;
}

test('request → accept → phone revealed → cancel with refund preview → seats restored', async ({ browser }) => {
  const passengerName = `Pax ${Date.now()}`;
  const { context: driverCtx, page: driver } = await newUserContext(browser);
  const { context: paxCtx, page: pax } = await newUserContext(browser);

  // Driver publishes a 2-seat ride three days out; own trip shows the manage link, not a request form.
  await signUp(driver, { name: 'Kabir Singh', email: uniqueEmail('drv'), password: 'longenough1', phone: '98111 22233' });
  const tripPath = await publishTrip(driver);
  await expect(driver.getByRole('link', { name: 'Manage this trip' })).toHaveAttribute('href', '/dashboard/trips');
  await expect(driver.getByRole('button', { name: 'Request seats' })).toHaveCount(0);

  // Signed-out visitors are sent to log in.
  await pax.goto(tripPath);
  await expect(pax.getByRole('link', { name: 'Log in to book' })).toHaveAttribute(
    'href',
    `/login?next=${encodeURIComponent(tripPath)}`,
  );

  // Passenger requests 1 seat.
  await signUp(pax, { name: passengerName, email: uniqueEmail('pax'), password: 'longenough1' });
  await pax.goto(tripPath);
  await pax.getByLabel('Seats').selectOption('1');
  await pax.getByRole('button', { name: 'Request seats' }).click();
  await expect(pax.getByText('Requested', { exact: true })).toBeVisible();
  await expect(pax.getByText('1 seat left')).toBeVisible();
  await expect(pax.getByText(/Driver's phone/)).toHaveCount(0);

  // Driver accepts on the dashboard.
  await driver.goto('/dashboard/trips');
  const card = driver.getByRole('listitem').filter({ has: driver.locator(`a[href="${tripPath}"]`) });
  await expect(card.getByText(passengerName)).toBeVisible();
  await expect(card.getByText('Requested', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: `Accept ${passengerName}` }).click();
  await expect(card.getByText('Accepted', { exact: true })).toBeVisible();

  // Passenger sees Accepted and the driver's phone, on the trip page and in their bookings.
  await pax.reload();
  await expect(pax.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(pax.getByRole('link', { name: '+919811122233' })).toBeVisible();
  await pax.goto('/dashboard/bookings');
  const booking = pax.getByRole('listitem').filter({ has: pax.locator(`a[href="${tripPath}"]`) });
  await expect(booking.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(booking.getByRole('link', { name: '+919811122233' })).toBeVisible();

  // Cancel: the refund is shown before confirming.
  await booking.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(booking.getByText("Cancel this booking? You'll get ₹450 back.")).toBeVisible();
  await booking.getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(booking.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(booking.getByText('Refunded ₹450')).toBeVisible();
  await expect(booking.getByRole('link', { name: '+919811122233' })).toHaveCount(0);

  // Seats are back on the trip page, and the passenger can request again.
  await pax.goto(tripPath);
  await expect(pax.getByText('2 seats left')).toBeVisible();
  await expect(pax.getByRole('button', { name: 'Request seats' })).toBeVisible();

  await driverCtx.close();
  await paxCtx.close();
});
