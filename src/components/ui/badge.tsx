import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-soft text-fg',
  // Solid fill: brand text on a brand tint falls under 4.5:1 at badge size.
  brand: 'bg-brand text-brand-ink',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/14 text-warning',
};

type BadgeProps = ComponentProps<'span'> & { tone?: BadgeTone };

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-xs font-bold whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
