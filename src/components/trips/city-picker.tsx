'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { fieldClasses } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import type { Place, PlaceSuggestion } from '@/modules/geo/types';
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
  /** Replaces the default field styling of the text input (e.g. the borderless cells of the home search bar). */
  inputClassName?: string;
  /** Appends a final "Choose on map…" option that calls `onMapPick`. */
  allowMapPick?: boolean;
  onMapPick?: () => void;
};

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;
const HINTS = {
  limited: 'Showing popular places',
  error: 'Search is unavailable — try a city name',
} as const;

/** Accessible combobox (ARIA 1.2 list autocomplete) that submits the chosen place as hidden inputs. */
export function CityPicker({
  name,
  id,
  placeholder,
  invalid,
  describedBy,
  onChange,
  defaultPlace = null,
  inputClassName,
  allowMapPick = false,
  onMapPick,
}: Props) {
  const listId = useId();
  const [text, setText] = useState(defaultPlace?.label ?? '');
  const [chosen, setChosen] = useState<Place | null>(defaultPlace);
  const [options, setOptions] = useState<PlaceSuggestion[]>([]);
  const [hint, setHint] = useState<keyof typeof HINTS | null>(null);
  const [searched, setSearched] = useState(false);
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
  const mapPick = allowMapPick && searched;
  const count = options.length + (mapPick ? 1 : 0);
  const expanded = open && (count > 0 || hint !== null);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    const mine = ++seq.current;
    if (q.trim().length < MIN_QUERY) {
      setOptions([]);
      setHint(null);
      setSearched(false);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      let places: PlaceSuggestion[] = [];
      let nextHint: keyof typeof HINTS | null = null;
      try {
        const res = await searchPlacesAction({ q });
        if (res.ok) {
          places = res.data.places;
          if (res.data.limited) nextHint = 'limited';
        } else nextHint = 'error';
      } catch {
        nextHint = 'error';
      }
      if (mine !== seq.current) return; // a newer keystroke superseded this lookup
      setOptions(places);
      setHint(nextHint);
      setSearched(true);
      setActive(-1);
      setOpen(true);
    }, DEBOUNCE_MS);
  }

  function pickOnMap() {
    seq.current++;
    setOpen(false);
    setActive(-1);
    onMapPick?.();
  }

  function chooseAt(i: number) {
    if (i === options.length) pickOnMap();
    else choose(options[i]);
  }

  function choose(place: Place) {
    seq.current++;
    if (timer.current) clearTimeout(timer.current);
    setChosen({ label: place.label, lat: place.lat, lng: place.lng });
    setText(place.label);
    setOpen(false);
    setActive(-1);
    onChange?.(place);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (count === 0) return;
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(e.key === 'ArrowDown' ? 0 : count - 1);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + count) % count);
    } else if (e.key === 'Enter') {
      if (expanded && active >= 0) {
        e.preventDefault(); // choose the option instead of submitting the form
        chooseAt(active);
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
      <input
        className={inputClassName ?? fieldClasses}
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
        onFocus={() => count > 0 && !chosen && setOpen(true)}
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
            key={`${o.label}-${o.lat}-${o.lng}`}
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
            <span className="block">{o.label}</span>
            {o.detail && <span className="block text-[13px] text-muted">{o.detail}</span>}
          </li>
        ))}
        {mapPick && (
          <li
            id={optionId(options.length)}
            role="option"
            aria-selected={active === options.length}
            onMouseDown={(e) => {
              e.preventDefault();
              pickOnMap();
            }}
            onMouseEnter={() => setActive(options.length)}
            className={cn(
              'cursor-pointer rounded-[10px] px-3 py-2 text-[15px] font-semibold text-brand',
              active === options.length && 'bg-soft',
            )}
          >
            Choose on map…
          </li>
        )}
        {hint && (
          <li role="presentation" className="px-3 py-2 text-[13px] text-muted">
            {HINTS[hint]}
          </li>
        )}
      </ul>
      <p className="sr-only" aria-live="polite">
        {expanded ? `${count} ${count === 1 ? 'suggestion' : 'suggestions'} available` : ''}
      </p>
    </div>
  );
}
