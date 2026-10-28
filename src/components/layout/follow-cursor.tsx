'use client';

import { useCallback, useRef, useSyncExternalStore, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

// Only for precise pointers, and never when the user asked for less motion (spec §9.5).
const QUERY = '(pointer: fine) and (prefers-reduced-motion: no-preference)';

// Some environments (older embeds, jsdom) lack matchMedia: treat that as "not enabled".
const media = () => (typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null);

function subscribe(onChange: () => void) {
  const mq = media();
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
}
const getSnapshot = () => media()?.matches ?? false;
const getServerSnapshot = () => false;

const EASE = 0.22;

/** Moves a fixed element toward the pointer with easing, one rAF loop at a time. */
function createFollower(el: HTMLElement) {
  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;
  let raf = 0;
  const place = () => {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  };
  const tick = () => {
    x += (tx - x) * EASE;
    y += (ty - y) * EASE;
    place();
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(tick) : 0;
  };
  return {
    enter(cx: number, cy: number) {
      x = tx = cx;
      y = ty = cy;
      place();
      el.dataset.on = '';
    },
    move(cx: number, cy: number) {
      tx = cx;
      ty = cy;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    leave() {
      delete el.dataset.on;
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}

type Follower = ReturnType<typeof createFollower>;

type FollowCursorProps = {
  /** Text in the pill, e.g. "View Delhi → Jaipur →". */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Wraps a photo route card: while hovered, a dark pill label follows the
 * pointer in place of the cursor. Inert (plain wrapper) on touch and under
 * reduced motion. The pill is portalled to <body> and fixed, so it never
 * shifts layout or gets clipped by the card.
 */
export function FollowCursor({ label, children, className }: FollowCursorProps) {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const follower = useRef<Follower | null>(null);

  const pillRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const f = createFollower(el);
    follower.current = f;
    return () => {
      f.destroy();
      if (follower.current === f) follower.current = null;
    };
  }, []);

  const isTouch = (e: PointerEvent) => e.pointerType === 'touch';

  return (
    <div
      className={cn(enabled && 'cursor-none', className)}
      onPointerEnter={(e) => !isTouch(e) && follower.current?.enter(e.clientX, e.clientY)}
      onPointerMove={(e) => !isTouch(e) && follower.current?.move(e.clientX, e.clientY)}
      onPointerLeave={() => follower.current?.leave()}
    >
      {children}
      {enabled &&
        createPortal(
          <div
            ref={pillRef}
            aria-hidden="true"
            className={cn(
              'pointer-events-none fixed top-0 left-0 z-50 rounded-full bg-fg px-3.5 py-2 text-[13px] font-bold whitespace-nowrap text-bg',
              '-translate-x-1/2 -translate-y-1/2 scale-60 opacity-0 transition-[opacity,scale] duration-200',
              'data-on:scale-100 data-on:opacity-100',
            )}
          >
            {label}
          </div>,
          document.body,
        )}
    </div>
  );
}
