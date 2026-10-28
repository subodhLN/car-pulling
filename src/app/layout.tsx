import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import { Footer } from '@/components/layout/footer';
import { SiteHeader } from '@/components/layout/site-header';
import { THEME_INIT_SCRIPT } from '@/components/layout/theme-toggle';
import './globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-figtree',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'RideShare: share the drive', template: '%s · RideShare' },
  description: 'Book a spare seat in a car going your way, or offer the empty seats in yours.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#151312' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // data-theme is set before paint by the inline script, so React must not complain about it.
    <html lang="en-IN" className={figtree.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-fg px-4 py-2 font-semibold text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="wrap flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
