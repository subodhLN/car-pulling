import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const fieldClasses =
  'h-11 w-full min-w-0 rounded-[14px] border border-line bg-surface px-4 text-base text-fg ' +
  'placeholder:text-muted transition-colors duration-200 hover:border-muted ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-invalid:border-danger';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldClasses, className)} {...props} />;
}
