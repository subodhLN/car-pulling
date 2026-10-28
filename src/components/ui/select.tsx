import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { fieldClasses } from './input';

/** Native select (keyboard and screen-reader friendly) with the field look and a custom chevron. */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <span className={cn('relative block', className)}>
      <select className={cn(fieldClasses, 'cursor-pointer appearance-none pr-10')} {...props}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
