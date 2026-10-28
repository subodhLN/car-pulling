import Image from 'next/image';
import Link from 'next/link';
import { FollowCursor } from '@/components/layout/follow-cursor';
import { cityPhoto } from './photos';

export type RouteCardProps = {
  href: string;
  originLabel: string;
  destLabel: string;
  destSlug: string | null;
  /** Small pill over the photo, e.g. "38 rides" or "See rides". */
  badge: string;
  /** Muted line under the title; `strong` is emphasised (the price). */
  meta: { text: string; strong?: string };
};

/** Photo route card (mockup .rc): 4:5 photo with a badge, "Origin → Dest", and a meta line. */
export function RouteCard({ href, originLabel, destLabel, destSlug, badge, meta }: RouteCardProps) {
  const photo = cityPhoto(destSlug);
  return (
    <FollowCursor label={`View ${originLabel} → ${destLabel} →`}>
      <Link href={href} className="group grid gap-3 rounded-photo focus-visible:outline-offset-4">
        <div className="relative isolate aspect-[4/5] overflow-hidden rounded-photo bg-soft">
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            placeholder="blur"
            sizes="(min-width: 1240px) 290px, (min-width: 961px) 24vw, 48vw"
            className="object-cover transition-transform duration-700 ease-settle group-hover:scale-[1.045]"
            style={photo.position ? { objectPosition: photo.position } : undefined}
          />
          <span className="absolute top-3 left-3 rounded-full bg-white/[.94] px-2.5 py-[5px] text-xs font-bold text-[#1f1b18]">
            {badge}
          </span>
        </div>
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-x-1.5 text-[17px] leading-snug font-bold tracking-[-0.01em]">
            <span>{originLabel}</span>
            <span aria-hidden="true" className="font-medium text-muted">
              →
            </span>
            <span className="sr-only">to</span>
            <span>{destLabel}</span>
          </h3>
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            {meta.text}
            {meta.strong ? <b className="font-bold text-fg">{meta.strong}</b> : null}
          </p>
        </div>
      </Link>
    </FollowCursor>
  );
}
