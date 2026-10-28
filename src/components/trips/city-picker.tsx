'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import type { Place } from '@/modules/geo/cities';
import { searchPlacesAction } from '@/modules/geo/actions';

type Props = {
  /** Prefix for the hidden inputs: `${name}Label`, `${name}Lat`, `${name}Lng`. */
  name: string;
  id: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  onChange?: (place: Place | null) => void;
  /** Prefill (e.g. from URL params); the place is submitted without the user typing. */
  defaultPlace?: Place | null;
};

/** Accessible combobox (ARIA 1.2 list autocomplete) that submits the chosen place as hidden inputs. */
export function CityPicker({ name, id, placeholder, invalid, describedBy, onChange, defaultPlace = null }: Props) {
  const listId = useId();
  const [text, setText] = useState(defaultPlace?.label ?? '');
  const [chosen, setChosen] = useState<Place | null>(defaultPlace);
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const expanded = open && options.length > 0;

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    const mine = ++seq.current;
    if (!q.trim()) {
      setOptions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const res = await searchPlacesAction({ q });
      if (mine !== seq.current) return; // a newer keystroke superseded this lookup
      const places = res.ok ? res.data : [];
      setOptions(places);
      setActive(-1);
      setOpen(places.length > 0);
    }, 150);
  }

  function choose(place: Place) {
    seq.current++;
    if (timer.current) clearTimeout(timer.current);
    setChosen(place);
    setText(place.label);
    setOpen(false);
    setActive(-1);
    onChange?.(place);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return;
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(e.key === 'ArrowDown' ? 0 : options.length - 1);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + options.length) % options.length);
    } else if (e.key === 'Enter') {
      if (expanded && active >= 0) {
        e.preventDefault(); // choose the option instead of submitting the form
        choose(options[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (chosen) {
            setChosen(null);
            onChange?.(null);
          }
          search(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => options.length > 0 && !chosen && setOpen(true)}
      />
      <input type="hidden" name={`${name}Label`} value={chosen?.label ?? ''} />
      <input type="hidden" name={`${name}Lat`} value={chosen?.lat ?? ''} />
      <input type="hidden" name={`${name}Lng`} value={chosen?.lng ?? ''} />
      <ul
        id={listId}
        role="listbox"
        aria-label={`${placeholder ?? 'Places'} suggestions`}
        hidden={!expanded}
        className="absolute z-20 mt-1.5 max-h-72 w-full overflow-auto rounded-[14px] border border-line bg-surface p-1 shadow-float"
      >
        {options.map((o, i) => (
          <li
            key={o.label}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            // mousedown (not click) so the input keeps focus and onBlur does not close the list first
            onMouseDown={(e) => {
              e.preventDefault();
              choose(o);
            }}
            onMouseEnter={() => setActive(i)}
            className={cn('cursor-pointer rounded-[10px] px-3 py-2 text-[15px]', i === active && 'bg-soft')}
          >
            {o.label}
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {expanded ? `${options.length} ${options.length === 1 ? 'suggestion' : 'suggestions'} available` : ''}
      </p>
    </div>
  );
}
