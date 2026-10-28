import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { PublishForm } from '@/components/trips/publish-form';
import { formatIst } from '@/lib/time';
import { requirePageUser } from '@/modules/auth/guards';
import { listVehicles } from '@/modules/vehicles/service';

export const metadata: Metadata = { title: 'Offer a ride' };

export default async function NewTripPage() {
  const user = await requirePageUser('/trips/new');
  const cars = await listVehicles(user.id);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">Offer a ride</h1>
      {cars.length === 0 ? (
        <div className="space-y-4">
          <p className="text-muted">You need to add a car before you can offer a ride.</p>
          <ButtonLink href="/dashboard/vehicles" size="lg">
            Add a car
          </ButtonLink>
        </div>
      ) : (
        <PublishForm
          cars={cars.map(({ id, make, model, color, seats }) => ({ id, make, model, color, seats }))}
          minDate={formatIst(new Date(), 'yyyy-MM-dd')}
        />
      )}
    </div>
  );
}
