'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Five-star picker as an ARIA radio group: one tab stop (roving tabindex), arrow keys move and select,
 * hover previews. `name` posts the value with a surrounding form.
 */
export function StarInput({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const lit = hover || value;

  function select(n: number) {
    onChange(n);
    refs.current[n - 1]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, n: number) {
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? Math.min(5, n + 1)
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? Math.max(1, n - 1)
          : e.key === 'Home'
            ? 1
            : e.key === 'End'
              ? 5
              : null;
    if (next === null) return;
    e.preventDefault();
    select(next);
  }

  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1" onMouseLeave={() => setHover(0)}>
      {STARS.map((n) => (
        <button
          key={n}
          ref={(el) => {
            refs.current[n - 1] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={n === 1 ? '1 star' : `${n} stars`}
          tabIndex={(value || 1) === n ? 0 : -1}
          disabled={disabled}
          onClick={() => select(n)}
          onKeyDown={(e) => onKeyDown(e, n)}
          onMouseEnter={() => setHover(n)}
          className={cn(
            'grid size-10 place-items-center rounded-full text-[28px] leading-none transition-[color,transform] duration-150',
            'outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            'hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none',
            n <= lit ? 'text-brand' : 'text-line',
          )}
        >
          <span aria-hidden>★</span>
        </button>
      ))}
      <input type="hidden" name={name} value={value || ''} />
    </div>
  );
}
