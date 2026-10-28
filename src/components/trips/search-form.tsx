'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CITIES, type Place } from '@/modules/geo/cities';
import { CityPicker } from './city-picker';

export type SearchFormValues = {
  from: Place | null;
  to: Place | null;
  date: string;
  seats: number;
  radius: number;
  sort: string;
};

/** A CITIES slug when the place is one of ours, otherwise "lat,lng" plus a label param. */
function placeParams(key: 'from' | 'to', place: Place, out: URLSearchParams) {
  const city = CITIES.find((c) => c.label === place.label && c.lat === place.lat && c.lng === place.lng);
  if (city) {
    out.set(key, city.slug);
  } else {
    out.set(key, `${place.lat},${place.lng}`);
    out.set(`${key}Label`, place.label);
  }
}

export function SearchForm({ initial }: { initial: SearchFormValues }) {
  const router = useRouter();
  const [from, setFrom] = useState<Place | null>(initial.from);
  const [to, setTo] = useState<Place | null>(initial.to);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!from || !to) {
      setError("Choose where you're leaving from and going to");
      return;
    }
    setError(null);
    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    placeParams('from', from, params);
    placeParams('to', to, params);
    const date = String(data.get('date') ?? '');
    if (date) params.set('date', date);
    params.set('seats', String(data.get('seats') ?? '1'));
    params.set('radius', String(initial.radius));
    params.set('sort', initial.sort);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Search rides"
      className="grid gap-3 rounded-card border border-line bg-surface p-4 md:grid-cols-[1fr_1fr_auto_auto_auto] md:items-end"
    >
      <div>
        <label htmlFor="search-from" className="mb-1.5 block text-sm font-semibold">
          Leaving from
        </label>
        <CityPicker name="from" id="search-from" placeholder="City or area" defaultPlace={initial.from} onChange={setFrom} />
      </div>
      <div>
        <label htmlFor="search-to" className="mb-1.5 block text-sm font-semibold">
          Going to
        </label>
        <CityPicker name="to" id="search-to" placeholder="City or area" defaultPlace={initial.to} onChange={setTo} />
      </div>
      <div>
        <label htmlFor="search-date" className="mb-1.5 block text-sm font-semibold">
          Date
        </label>
        <Input id="search-date" name="date" type="date" required defaultValue={initial.date} />
      </div>
      <div>
        <label htmlFor="search-seats" className="mb-1.5 block text-sm font-semibold">
          Seats
        </label>
        <Select id="search-seats" name="seats" defaultValue={String(initial.seats)}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="lg">
        Search
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger md:col-span-full">
          {error}
        </p>
      ) : null}
    </form>
  );
}
