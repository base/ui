import './globals.css';

import { PropsWithChildren } from 'react';
import localFont from 'next/font/local';
import { Roboto_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';

import { AppShell } from './components/AppShell';

const googleSansFlex = localFont({
  src: [
    {
      path: '../public/fonts/GoogleSansFlex/GoogleSansFlex-Variable.ttf',
      weight: '100 1000',
      style: 'normal',
    },
  ],
  variable: '--font-google-sans-flex',
  display: 'swap',
});

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
});

// Dot-matrix face used only by the animated Base logo, where the wordmark first
// spells out in dots before resolving into the UI sans. Same binary base.org
// ships (a variable TTF instanced to Doto Black), so the two render identically.
const doto = localFont({
  src: '../public/fonts/Doto/Doto-Black.ttf',
  variable: '--font-doto',
  display: 'swap',
  adjustFontFallback: false,
});

// Runs before the first paint to stamp the resolved theme on <html>. Light is
// the default: dark applies only when the visitor has explicitly chosen it, so
// the system preference is deliberately not consulted. Kept as a constant so it
// stays a static literal — see the note at the injection site.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){}})()`;

export const metadata = {
  metadataBase: new URL('https://chain.base.org'),
  title: 'Base Chain',
  description: 'Dashboards and tools for Base Chain, in one place.',
  openGraph: {
    type: 'website',
    url: 'https://chain.base.org',
    images: '/images/base-open-graph-v2.png',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@buildonbase',
    title: 'Base Chain',
    description: 'Base is the blockchain for global finance.',
    images: '/images/base-open-graph-v2.png',
  },
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html
      lang="en"
      className={`${googleSansFlex.variable} ${robotoMono.variable} ${doto.variable} antialiased overflow-y-scroll overscroll-y-none [scrollbar-gutter:stable]`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint. Anything later — even
            a layout effect — lands after the browser has already painted the
            light spectrum, which reads as a white flash. The body is a
            build-time constant with no interpolation, so nothing
            user-controlled can reach it. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <Analytics />
      </body>
    </html>
  );
}
