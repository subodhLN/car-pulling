import type { Metadata } from 'next';
import Image from 'next/image';
import credits from '../../../public/images/credits.json';

export const metadata: Metadata = { title: 'Photo credits' };

type Credit = { file: string; subject: string; unsplashUrl: string };

export default function CreditsPage() {
  const list: Credit[] = credits;
  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <h1 className="text-[clamp(30px,4vw,40px)]">Photo credits</h1>
      <p className="mt-2 max-w-[60ch] text-muted">
        The photos on RideShare come from Unsplash and are used under the{' '}
        <a
          href="https://unsplash.com/license"
          className="font-semibold text-fg underline decoration-line underline-offset-4 hover:decoration-fg"
          rel="noopener noreferrer"
        >
          Unsplash License
        </a>
        . Thank you to the photographers who share their work there.
      </p>
      <ul className="mt-8 grid gap-3">
        {list.map((c) => (
          <li key={c.file} className="flex items-center gap-4 rounded-card border border-line bg-surface p-3 pr-5">
            <div className="relative size-16 flex-none overflow-hidden rounded-xl bg-soft">
              <Image src={c.file} alt="" fill sizes="64px" className="object-cover" />
            </div>
            <p className="min-w-0 flex-1 font-semibold">{c.subject}</p>
            <a
              href={c.unsplashUrl}
              rel="noopener noreferrer"
              className="flex-none border-b-[1.5px] border-current pb-px text-sm font-semibold transition-colors hover:text-muted"
            >
              View original on Unsplash<span className="sr-only">: {c.subject}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
