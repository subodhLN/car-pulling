import Image from 'next/image';
import { HERO_PHOTO } from './photos';

/** Inset rounded hero photo with the headline (mockup .hero). The search bar overlaps its bottom edge. */
export function Hero() {
  return (
    <div className="relative isolate h-[clamp(420px,56vw,600px)] overflow-hidden rounded-hero bg-[#2a2420]">
      <Image
        src={HERO_PHOTO.src}
        alt={HERO_PHOTO.alt}
        fill
        preload
        placeholder="blur"
        sizes="(min-width: 1240px) 1208px, calc(100vw - 32px)"
        className="animate-settle object-cover"
        style={{ objectPosition: HERO_PHOTO.position }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(20,14,10,.72)_0%,rgba(20,14,10,.35)_45%,rgba(20,14,10,0)_70%),linear-gradient(0deg,rgba(20,14,10,.45),rgba(20,14,10,0)_40%)] max-[860px]:bg-[linear-gradient(0deg,rgba(20,14,10,.8)_0%,rgba(20,14,10,.35)_55%,rgba(20,14,10,.1)_100%)]"
      />
      <div className="absolute right-5 bottom-[clamp(84px,11vw,120px)] left-[clamp(20px,5vw,64px)] z-10 max-w-[600px] animate-fade-up text-white [animation-delay:.2s] max-[860px]:bottom-7">
        <h1 className="mb-4 text-[clamp(36px,6.2vw,72px)] leading-[0.98] font-extrabold tracking-[-0.035em] text-balance">
          Someone’s already driving your way.
        </h1>
        <p className="max-w-[44ch] text-[clamp(16px,1.6vw,19px)] text-white/[.86]">
          Book a spare seat in a car going where you’re going. Split the fuel, skip the bus queue.
        </p>
      </div>
    </div>
  );
}
