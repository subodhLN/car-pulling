import type { Vehicle } from '@prisma/client';
import { db } from '@/lib/db';
import { err, ok, type Result } from '@/lib/result';
import { vehicleSchema, type VehicleInput } from './schemas';

export async function createVehicle(ownerId: string, input: VehicleInput): Promise<Vehicle> {
  const data = vehicleSchema.parse(input);
  return db.vehicle.create({ data: { ownerId, ...data } });
}

export async function listVehicles(ownerId: string): Promise<Vehicle[]> {
  return db.vehicle.findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } });
}

export async function deleteVehicle(ownerId: string, vehicleId: string): Promise<Result<void>> {
  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, ownerId }, select: { id: true } });
  if (!vehicle) return err('NOT_FOUND', 'Car not found');

  const upcoming = await db.trip.count({
    where: { vehicleId, status: 'PUBLISHED', departureAt: { gt: new Date() } },
  });
  if (upcoming > 0) return err('INVALID_STATE', 'This car is used by an upcoming trip');

  // Trip.vehicleId is ON DELETE RESTRICT: any other trip (past, cancelled) also pins the vehicle.
  if ((await db.trip.count({ where: { vehicleId } })) > 0) {
    return err('INVALID_STATE', "This car is linked to past trips and can't be removed");
  }
  try {
    await db.vehicle.delete({ where: { id: vehicleId } });
  } catch (e) {
    const code = (e as { code?: string }).code;
    // P2025: already deleted concurrently. P2003: a trip was created between the check and the delete.
    if (code === 'P2025') return err('NOT_FOUND', 'Car not found');
    if (code === 'P2003') return err('INVALID_STATE', 'This car is used by an upcoming trip');
    throw e;
  }
  return ok(undefined);
}
