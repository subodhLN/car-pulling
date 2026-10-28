'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { publishFormSchema } from '@/modules/trips/schemas';
import { publishTripAction } from '@/modules/trips/actions';
import { CityPicker } from './city-picker';

export type CarOption = { id: string; make: string; model: string; color: string; seats: number };
type Field = 'origin' | 'dest' | 'date' | 'time' | 'vehicleId' | 'seats' | 'price' | 'notes';
type Errors = Partial<Record<Field, string>>;

function fieldOf(path: PropertyKey | undefined): Field | undefined {
  const key = String(path ?? '');
  if (key.startsWith('origin')) return 'origin';
  if (key.startsWith('dest')) return 'dest';
  return key as Field;
}

function Row({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
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

export function PublishForm({ cars, minDate }: { cars: CarOption[]; minDate: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [carId, setCarId] = useState(cars[0].id);
  const [pending, start] = useTransition();
  const car = cars.find((c) => c.id === carId) ?? cars[0];

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    setFormError(null);
    const parsed = publishFormSchema.safeParse(raw);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const f = fieldOf(issue.path[0]);
        if (f && !next[f]) next[f] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await publishTripAction(raw);
      if (res.ok) {
        router.push(`/trips/${res.data.id}`);
        return;
      }
      setFormError(res.message);
    });
  }

  const a11y = (f: Field) => ({
    invalid: Boolean(errors[f]),
    describedBy: errors[f] ? `${f}-error` : undefined,
  });
  const inv = (f: Field) => ({
    'aria-invalid': errors[f] ? (true as const) : undefined,
    'aria-describedby': errors[f] ? `${f}-error` : undefined,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError ? (
        <p role="alert" className="rounded-[14px] border border-danger px-4 py-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Row id="origin" label="From" error={errors.origin}>
          <CityPicker id="origin" name="origin" placeholder="Leaving from" {...a11y('origin')} />
        </Row>
        <Row id="dest" label="To" error={errors.dest}>
          <CityPicker id="dest" name="dest" placeholder="Going to" {...a11y('dest')} />
        </Row>
        <Row id="date" label="Date" error={errors.date}>
          <Input id="date" name="date" type="date" min={minDate} {...inv('date')} />
        </Row>
        <Row id="time" label="Departure time (IST)" error={errors.time}>
          <Input id="time" name="time" type="time" {...inv('time')} />
        </Row>
        <Row id="vehicleId" label="Car" error={errors.vehicleId}>
          <Select id="vehicleId" name="vehicleId" value={carId} onChange={(e) => setCarId(e.target.value)} {...inv('vehicleId')}>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.make} {c.model} · {c.color}
              </option>
            ))}
          </Select>
        </Row>
        <Row id="seats" label="Seats offered" error={errors.seats}>
          {/* keyed by car so the default resets when the seat count changes */}
          <Select key={car.id} id="seats" name="seats" defaultValue={String(Math.min(3, car.seats))} {...inv('seats')}>
            {Array.from({ length: car.seats }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Row>
        <Row id="price" label="Price per seat (₹)" error={errors.price}>
          <Input id="price" name="price" type="number" inputMode="decimal" min={50} max={5000} step="1" placeholder="450" {...inv('price')} />
        </Row>
      </div>
      <Row id="notes" label="Notes (optional)" error={errors.notes}>
        <textarea
          id="notes"
          name="notes"
          maxLength={500}
          rows={3}
          placeholder="Luggage space, pickup point details, music preferences…"
          className="w-full rounded-[14px] border border-line bg-surface px-4 py-3 text-base text-fg placeholder:text-muted hover:border-muted aria-invalid:border-danger"
          {...inv('notes')}
        />
      </Row>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Publishing…' : 'Publish trip'}
      </Button>
    </form>
  );
}
