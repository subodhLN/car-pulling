import type { Metadata } from 'next';
import { requireUser } from '@/modules/auth/guards';
import { listVehicles } from '@/modules/vehicles/service';
import { VehicleManager } from '@/modules/vehicles/vehicle-manager';

export const metadata: Metadata = { title: 'Your cars' };

export default async function VehiclesPage() {
  const user = await requireUser();
  const vehicles = await listVehicles(user.id);
  return (
    <VehicleManager
      vehicles={vehicles.map(({ id, make, model, color, seats }) => ({ id, make, model, color, seats }))}
    />
  );
}
