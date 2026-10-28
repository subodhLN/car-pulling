import Image from 'next/image';
import type { ReactNode } from 'react';
import { TRUST_PHOTO } from './photos';

const icon = (path: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="size-10 rounded-xl bg-soft p-[9px] text-brand"
  >
    {path}
  </svg>
);

// Copy claims only what M1 does (spec §9.1): no ID checks, ratings or card holds yet.
const POINTS = [
  {
    title: 'Real profiles',
    body: 'See who’s driving and in which car before you request a seat.',
    icon: icon(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </>,
    ),
  },
  {
    title: 'You choose who you ride with',
    body: 'Drivers accept each request, and you can cancel any time before departure.',
    icon: icon(
      <>
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
        <path d="m9 12 2 2 4-4" />
      </>,
    ),
  },
  {
    title: 'You only pay when you’re in',
    body: 'Requesting a seat is free, and the seat is held for you while the driver decides.',
    icon: icon(
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </>,
    ),
  },
];

/** "How it works" trust block (mockup .trust): photo beside three short, true promises. */
export function TrustSection() {
  return (
    <section id="how" aria-labelledby="trust-heading" className="scroll-mt-6 pt-[72px]">
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-[clamp(24px,5vw,72px)] max-[860px]:grid-cols-1">
        <div className="relative aspect-[11/8] overflow-hidden rounded-hero">
          <Image
            src={TRUST_PHOTO.src}
            alt={TRUST_PHOTO.alt}
            fill
            placeholder="blur"
            sizes="(min-width: 1240px) 640px, (min-width: 861px) 52vw, calc(100vw - 32px)"
            className="object-cover"
          />
        </div>
        <div>
          <h2
            id="trust-heading"
            className="mb-7 text-[clamp(30px,4vw,46px)] leading-[1.02] font-extrabold tracking-[-0.03em] text-balance"
          >
            Travel with people, not strangers.
          </h2>
          <ul className="grid gap-[22px]">
            {POINTS.map((p) => (
              <li key={p.title} className="grid grid-cols-[40px_1fr] gap-3.5">
                {p.icon}
                <div>
                  <b className="mb-0.5 block text-[17px] font-bold">{p.title}</b>
                  <span className="text-muted">{p.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
