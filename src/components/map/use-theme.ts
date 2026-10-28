'use client';

import { useSyncExternalStore } from 'react';
import type { MapTheme } from '@/styles/map-style';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
  media?.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', onChange);
  };
}

function snapshot(): MapTheme {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** The theme actually shown: explicit <html data-theme>, else the OS preference. */
export function useResolvedTheme(): MapTheme {
  return useSyncExternalStore(subscribe, snapshot, () => 'light');
}
