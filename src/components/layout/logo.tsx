import { cn } from '@/lib/cn';

/** The RideShare mark from the approved mockup: a filled origin, an open destination, a route between. */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      aria-hidden="true"
      className={cn('flex-none text-brand', className)}
    >
      <circle cx="6" cy="19" r="3.2" fill="currentColor" />
      <circle cx="20" cy="7" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M6 19 C6 11, 20 15, 20 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
