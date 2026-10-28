import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { vehicleSchema } from '@/modules/vehicles/schemas';
import { createVehicle, deleteVehicle, listVehicles } from '@/modules/vehicles/service';
import { resetDb } from '../../helpers/db';
import { createTrip, createUser, createVehicle as makeVehicle } from '../../helpers/factories';

beforeEach(resetDb);

const input = { make: 'Maruti', model: 'Ertiga', color: 'White', seats: 4 };
const DAY = 24 * 60 * 60 * 1000;

describe('vehicles service', () => {
  it('create/list round-trip, scoped to owner', async () => {
    const a = await createUser();
    const b = await createUser();
    const v = await createVehicle(a.id, input);
    await createVehicle(b.id, input);
    const list = await listVehicles(a.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: v.id, make: 'Maruti', seats: 4 });
  });

  it('deletes an unused vehicle', async () => {
    const a = await createUser();
    const v = await makeVehicle(a.id);
    expect(await deleteVehicle(a.id, v.id)).toEqual({ ok: true, data: undefined });
    expect(await db.vehicle.count()).toBe(0);
  });

  it('deleting another user\'s or a missing vehicle → NOT_FOUND', async () => {
    const a = await createUser();
    const b = await createUser();
    const v = await makeVehicle(a.id);
    expect(await deleteVehicle(b.id, v.id)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await deleteVehicle(a.id, 'nope')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await db.vehicle.count()).toBe(1);
  });

  it('upcoming published trip → INVALID_STATE', async () => {
    const a = await createUser();
    const v = await makeVehicle(a.id);
    await createTrip({ driverId: a.id, vehicleId: v.id });
    expect(await deleteVehicle(a.id, v.id)).toEqual({
      ok: false,
      code: 'INVALID_STATE',
      message: 'This car is used by an upcoming trip',
    });
    expect(await db.vehicle.count()).toBe(1);
  });

  it('only past/cancelled trips → INVALID_STATE (linked to past trips), no DB throw', async () => {
    const a = await createUser();
    const v1 = await makeVehicle(a.id);
    const v2 = await makeVehicle(a.id);
    await createTrip({ driverId: a.id, vehicleId: v1.id, departureAt: new Date(Date.now() - DAY) });
    await createTrip({ driverId: a.id, vehicleId: v2.id, status: 'CANCELLED' });
    const msg = "This car is linked to past trips and can't be removed";
    expect(await deleteVehicle(a.id, v1.id)).toEqual({ ok: false, code: 'INVALID_STATE', message: msg });
    expect(await deleteVehicle(a.id, v2.id)).toEqual({ ok: false, code: 'INVALID_STATE', message: msg });
    expect(await db.vehicle.count()).toBe(2);
  });
});

describe('vehicleSchema', () => {
  it('rejects 8 or 0 seats and non-integers', () => {
    expect(vehicleSchema.safeParse({ ...input, seats: 8 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...input, seats: 0 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...input, seats: 2.5 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...input, seats: 7 }).success).toBe(true);
  });
  it('trims and bounds strings', () => {
    expect(vehicleSchema.parse({ ...input, make: '  Tata ' }).make).toBe('Tata');
    expect(vehicleSchema.safeParse({ ...input, make: '   ' }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...input, make: 'x'.repeat(41) }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...input, color: 'x'.repeat(21) }).success).toBe(false);
  });
  it('coerces seats from a string (form input)', () => {
    expect(vehicleSchema.parse({ ...input, seats: '3' }).seats).toBe(3);
  });
});
