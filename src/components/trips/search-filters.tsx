'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { RADIUS_OPTIONS } from '@/modules/trips/search-params';

export function SearchFilters({ sort, radius }: { sort: string; radius: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();

  function update(key: 'sort' | 'radius', value: string) {
    const next = new URLSearchParams(current.toString());
    next.set(key, value);
    next.delete('page');
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        Sort by
        <Select value={sort} onChange={(e) => update('sort', e.target.value)}>
          <option value="departure">Departure time</option>
          <option value="price">Price</option>
          <option value="pickup">Pickup distance</option>
        </Select>
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        Radius
        <Select value={String(radius)} onChange={(e) => update('radius', e.target.value)}>
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r} km
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
