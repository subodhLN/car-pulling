'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { addVehicleAction, deleteVehicleAction } from './actions';
import { vehicleSchema } from './schemas';

export type VehicleView = { id: string; make: string; model: string; color: string; seats: number };
type Errors = Partial<Record<'make' | 'model' | 'color' | 'seats', string>>;

function seatsLabel(n: number) {
  return `${n} passenger ${n === 1 ? 'seat' : 'seats'}`;
}

function VehicleRow({ vehicle }: { vehicle: VehicleView }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteVehicleAction({ vehicleId: vehicle.id });
      if (res.ok) {
        router.refresh();
        return;
      }
      setConfirming(false);
      setError(res.message);
    });
  }

  return (
    <li>
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">
          {vehicle.make} {vehicle.model} · {vehicle.color} · {seatsLabel(vehicle.seats)}
        </p>
        {confirming ? (
          <div className="flex items-center gap-2" role="group" aria-label={`Confirm removing ${vehicle.make} ${vehicle.model}`}>
            <span className="text-sm text-muted">Remove this car?</span>
            <Button variant="danger" onClick={remove} disabled={pending}>
              {pending ? 'Removing…' : 'Yes, remove'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Keep
            </Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
        {error ? (
          <p role="alert" className="w-full text-sm text-danger">
            {error}
          </p>
        ) : null}
      </Card>
    </li>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AddVehicleForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    setFormError(null);
    const parsed = vehicleSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await addVehicleAction(raw);
      if (res.ok) {
        form.reset();
        router.refresh();
        return;
      }
      setFormError(res.message);
    });
  }

  const err = (k: keyof Errors) => ({
    'aria-invalid': errors[k] ? (true as const) : undefined,
    'aria-describedby': errors[k] ? `${k}-error` : undefined,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? (
        <p role="alert" className="rounded-[14px] border border-danger px-4 py-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="make" label="Make" error={errors.make}>
          <Input id="make" name="make" placeholder="Maruti" {...err('make')} />
        </Field>
        <Field id="model" label="Model" error={errors.model}>
          <Input id="model" name="model" placeholder="Ertiga" {...err('model')} />
        </Field>
        <Field id="color" label="Colour" error={errors.color}>
          <Input id="color" name="color" placeholder="White" {...err('color')} />
        </Field>
        <Field id="seats" label="Passenger seats" error={errors.seats}>
          <Select id="seats" name="seats" defaultValue="3" {...err('seats')}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Adding…' : 'Add car'}
      </Button>
    </form>
  );
}

export function VehicleManager({ vehicles }: { vehicles: VehicleView[] }) {
  return (
    <div className="space-y-8">
      {vehicles.length === 0 ? (
        <p className="text-muted">Add the car you&apos;ll drive so you can offer rides.</p>
      ) : (
        <ul className="space-y-3">
          {vehicles.map((v) => (
            <VehicleRow key={v.id} vehicle={v} />
          ))}
        </ul>
      )}
      <section aria-labelledby="add-car-heading">
        <h2 id="add-car-heading" className="mb-4 text-xl font-bold">
          Add a car
        </h2>
        <AddVehicleForm />
      </section>
    </div>
  );
}
