import { ButtonLink } from '@/components/ui/button';

// Placeholder home inside the shell; the photo-led home page arrives in a later task.
export default function HomePage() {
  return (
    <section className="rounded-hero bg-soft px-[clamp(20px,5vw,64px)] py-[clamp(48px,8vw,96px)]">
      <h1 className="max-w-[14ch] text-[clamp(36px,6.2vw,72px)] leading-[0.98] tracking-[-0.035em]">
        Someone’s already driving your way.
      </h1>
      <p className="mt-4 max-w-[44ch] text-[clamp(16px,1.6vw,19px)] text-muted">
        Book a spare seat in a car going where you’re going. Split the fuel, skip the bus queue.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/search" size="lg">
          Find a ride
        </ButtonLink>
        <ButtonLink href="/trips/new" size="lg" variant="ghost">
          Offer a ride
        </ButtonLink>
      </div>
    </section>
  );
}
