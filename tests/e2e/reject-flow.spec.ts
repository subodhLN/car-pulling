import { expect, newUserContext, publishTrip, signUp, test, uniqueEmail } from './helpers';

test('request → driver rejects → passenger sees Rejected → seats restored on the trip page', async ({ browser }) => {
  const passengerName = `Pax ${Date.now()}`;
  const { context: driverCtx, page: driver } = await newUserContext(browser);
  const { context: paxCtx, page: pax } = await newUserContext(browser);

  await signUp(driver, { name: 'Meera Kaur', email: uniqueEmail('drv'), password: 'longenough1', phone: '98222 33344' });
  const tripPath = await publishTrip(driver);
  await expect(driver.getByText('2 seats left')).toBeVisible();

  await signUp(pax, { name: passengerName, email: uniqueEmail('pax'), password: 'longenough1' });
  await pax.goto(tripPath);
  await pax.getByLabel('Seats').selectOption('1');
  await pax.getByRole('button', { name: 'Request seats' }).click();
  await expect(pax.getByText('Requested', { exact: true })).toBeVisible();
  await expect(pax.getByText('1 seat left')).toBeVisible();

  // Driver rejects from the dashboard.
  await driver.goto('/dashboard/trips');
  const card = driver.getByRole('listitem').filter({ has: driver.locator(`a[href="${tripPath}"]`) });
  await expect(card.getByText(passengerName)).toBeVisible();
  await card.getByRole('button', { name: `Reject ${passengerName}` }).click();
  await expect(card.getByText('Rejected', { exact: true })).toBeVisible();

  // Passenger sees Rejected, never the driver's phone, and both seats are open again.
  await pax.goto('/dashboard/bookings');
  const booking = pax.getByRole('listitem').filter({ has: pax.locator(`a[href="${tripPath}"]`) });
  await expect(booking.getByText('Rejected', { exact: true })).toBeVisible();
  await expect(booking.getByRole('link', { name: '+919822233344' })).toHaveCount(0);
  await pax.goto(tripPath);
  await expect(pax.getByText('2 seats left')).toBeVisible();

  await driverCtx.close();
  await paxCtx.close();
});
