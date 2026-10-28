import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { resetDb } from '../../helpers/db';
import { createTrip, createUser, createVehicle } from '../../helpers/factories';

describe('schema', () => {
  beforeEach(resetDb);

  it('stores trip points and finds them with ST_DWithin', async () => {
    const t = await createTrip({ origin: { lat: 28.6139, lng: 77.209 } });
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Trip" WHERE ST_DWithin("originPoint",
        ST_SetSRID(ST_MakePoint(77.0266, 28.4595),4326)::geography, 30000)`; // Gurugram, ~27 km
    expect(rows.map((r) => r.id)).toEqual([t.id]);
  });

  it('does not match points outside the radius', async () => {
    await createTrip({ origin: { lat: 28.6139, lng: 77.209 } });
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Trip" WHERE ST_DWithin("originPoint",
        ST_SetSRID(ST_MakePoint(77.0266, 28.4595),4326)::geography, 5000)`;
    expect(rows).toEqual([]);
  });

  it('rejects seatsAvailable below zero', async () => {
    const t = await createTrip();
    await expect(
      db.$executeRaw`UPDATE "Trip" SET "seatsAvailable" = -1 WHERE id = ${t.id}`,
    ).rejects.toThrow(/trip_seats_chk/);
  });

  it('rejects seatsAvailable above seatsTotal', async () => {
    const t = await createTrip();
    await expect(
      db.$executeRaw`UPDATE "Trip" SET "seatsAvailable" = 99 WHERE id = ${t.id}`,
    ).rejects.toThrow(/trip_seats_chk/);
  });

  it('allows only one active booking per passenger per trip', async () => {
    const trip = await createTrip();
    const passenger = await createUser();
    const base = { tripId: trip.id, passengerId: passenger.id, seats: 1, amount: 45000 };

    await db.booking.create({ data: { ...base, status: 'REQUESTED' } });
    await expect(db.booking.create({ data: { ...base, status: 'REQUESTED' } })).rejects.toThrow(
      /Unique constraint failed on the fields: \(`tripId`,`passengerId`\)/,
    );
    await expect(db.booking.create({ data: { ...base, status: 'ACCEPTED' } })).rejects.toThrow(
      /Unique constraint failed on the fields: \(`tripId`,`passengerId`\)/,
    );
  });

  it('allows a new active booking after a cancelled one', async () => {
    const trip = await createTrip();
    const passenger = await createUser();
    const base = { tripId: trip.id, passengerId: passenger.id, seats: 1, amount: 45000 };

    await db.booking.create({
      data: { ...base, status: 'CANCELLED', cancelledBy: 'PASSENGER' },
    });
    await expect(
      db.booking.create({ data: { ...base, status: 'REQUESTED' } }),
    ).resolves.toMatchObject({ status: 'REQUESTED' });
  });

  it('creates unique users and vehicles with factories', async () => {
    const a = await createUser();
    const b = await createUser();
    expect(a.email).not.toBe(b.email);
    const v = await createVehicle(a.id);
    expect(v.ownerId).toBe(a.id);
  });
});
