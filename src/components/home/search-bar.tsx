'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { CityPicker } from '@/components/trips/city-picker';
import { cn } from '@/lib/cn';
import type { Place } from '@/modules/geo/cities';
import { searchHref } from '@/modules/trips/search-params';

const SEATS = [1, 2, 3, 4] as const;

/** "Wed, 28 Oct" for a YYYY-MM-DD day, the same on server and client (no locale-dependent date input text). */
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return 'Choose a date';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

// Borderless controls inside the pill cells; the cell shows hover and focus instead.
const bare =
  'block h-6 w-full min-w-0 truncate border-0 bg-transparent p-0 text-[15px] text-fg placeholder:text-muted ' +
  'focus-visible:outline-none';

/** One cell of the pill. Clicking anywhere in it focuses (or opens) its control. */
function Cell({ id, label, children, className }: { id: string; label: string; children: ReactNode; className?: string }) {
  function onClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('input, select, label, [role="listbox"]')) return;
    const el = document.getElementById(id);
    el?.focus();
    if (el instanceof HTMLInputElement && el.type === 'date') {
      try {
        el.showPicker();
      } catch {
        // showPicker is unavailable or not allowed here: focus alone is fine
      }
    }
  }
  return (
    <div
      onClick={onClick}
      className={cn(
        'min-w-0 cursor-pointer rounded-full px-[22px] py-2.5 transition-colors duration-200 hover:bg-soft',
        'has-[:focus-visible]:bg-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand',
        'max-[860px]:rounded-[14px] max-[860px]:bg-soft max-[860px]:px-4',
        className,
      )}
    >
      <label htmlFor={id} className="block cursor-pointer text-xs font-bold tracking-[.02em]">
        {label}
      </label>
      {children}
    </div>
  );
}

/** The home search pill (mockup .search): from, to, date, seats → /search. */
export function SearchBar({ today }: { today: string }) {
  const router = useRouter();
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(today);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!from || !to) {
      setError("Choose where you're leaving from and going to");
      return;
    }
    setError(null);
    const data = new FormData(e.currentTarget);
    const day = String(data.get('date') || today);
    router.push(searchHref({ from, to, date: day, seats: Number(data.get('seats') ?? 1) }));
  }

  const divider = 'min-[861px]:border-l min-[861px]:border-line min-[861px]:rounded-l-none';

  return (
    <div className="relative z-10 mx-auto -mt-11 w-[min(100%-32px,980px)] animate-fade-up [animation-delay:.45s] max-[860px]:mt-3.5 max-[860px]:w-full">
      <form
        role="search"
        aria-label="Find a ride"
        onSubmit={onSubmit}
        noValidate
        className={cn(
          'grid grid-cols-[1.2fr_1.2fr_1fr_1fr_auto] items-center rounded-full border border-line bg-surface p-2 shadow-float',
          'max-[860px]:grid-cols-2 max-[860px]:gap-1 max-[860px]:rounded-[22px]',
        )}
      >
        <Cell id="home-from" label="Leaving from">
          <CityPicker
            name="from"
            id="home-from"
            placeholder="City or area"
            onChange={(p) => {
              setFrom(p);
              if (p && to) setError(null);
            }}
            inputClassName={bare}
            invalid={Boolean(error && !from)}
            describedBy={error ? 'home-search-error' : undefined}
          />
        </Cell>
        <Cell id="home-to" label="Going to" className={divider}>
          <CityPicker
            name="to"
            id="home-to"
            placeholder="City or area"
            onChange={(p) => {
              setTo(p);
              if (p && from) setError(null);
            }}
            inputClassName={bare}
            invalid={Boolean(error && !to)}
            describedBy={error ? 'home-search-error' : undefined}
          />
        </Cell>
        <Cell id="home-date" label="When" className={divider}>
          {/* The native input stays focusable and typeable but invisible; the cell shows a readable day instead. */}
          <span className="relative block">
            <span aria-hidden="true" className={cn(bare, 'pointer-events-none')}>
              {date === today ? `Today, ${dayLabel(date).split(', ')[1]}` : dayLabel(date)}
            </span>
            <input
              id="home-date"
              name="date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker();
                } catch {
                  // not supported: the field is still editable from the keyboard
                }
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
        </Cell>
        <Cell id="home-seats" label="Seats" className={divider}>
          <select id="home-seats" name="seats" defaultValue="1" className={cn(bare, 'cursor-pointer appearance-none')}>
            {SEATS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '1 passenger' : `${n} passengers`}
              </option>
            ))}
          </select>
        </Cell>
        <button
          type="submit"
          className={cn(
            'flex h-14 items-center justify-center gap-2 rounded-full bg-brand px-[26px] text-base font-bold text-brand-ink',
            'transition-[transform,filter] duration-200 hover:scale-[1.03] hover:brightness-[1.06] active:scale-[0.98]',
            'max-[860px]:col-span-full max-[860px]:mt-1',
          )}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Search
        </button>
      </form>
      <p id="home-search-error" role="alert" className="mt-2 min-h-5 text-center text-sm font-medium text-danger empty:mt-0 empty:min-h-0">
        {error ?? ''}
      </p>
    </div>
  );
}
