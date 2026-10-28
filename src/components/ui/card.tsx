import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type CardProps = ComponentProps<'div'> & {
  /** Lift 2px with the float shadow on hover (for clickable cards). */
  interactive?: boolean;
};

/** Content card: 18px radius, hairline border, surface background (spec §9.2). */
export function Card({ interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface p-5',
        interactive &&
          'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-float',
        className,
      )}
      {...props}
    />
  );
}
