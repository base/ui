import './globals.css';

import { PropsWithChildren } from 'react';
import localFont from 'next/font/local';
import { Analytics } from '@vercel/analytics/next';

import { AppShell } from './components/AppShell';

const baseSansMono = localFont({
  src: [
    {
      path: '../public/fonts/BaseSansMono/BaseSansMono-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/BaseSansMono/BaseSansMono-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
  ],
  variable: '--font-base-sans-mono',
  display: 'swap',
  adjustFontFallback: false,
});

const baseSansText = localFont({
  src: [
    { path: '../public/fonts/BaseSans/BaseSans-RegularText.woff', weight: '400', style: 'normal' },
    { path: '../public/fonts/BaseSans/BaseSans-ItalicText.woff', weight: '400', style: 'italic' },
  ],
  variable: '--font-base-sans-text',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

const baseSans = localFont({
  src: [
    { path: '../public/fonts/BaseSans/BaseSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/BaseSans/BaseSans-Regular.woff', weight: '400', style: 'normal' },
    { path: '../public/fonts/BaseSans/BaseSans-Italic.woff', weight: '400', style: 'italic' },
    { path: '../public/fonts/BaseSans/BaseSans-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/BaseSans/BaseSans-Medium.woff', weight: '500', style: 'normal' },
    { path: '../public/fonts/BaseSans/BaseSans-MediumItalic.woff', weight: '500', style: 'italic' },
    { path: '../public/fonts/BaseSans/BaseSans-Bold.woff', weight: '700', style: 'normal' },
    { path: '../public/fonts/BaseSans/BaseSans-BoldItalic.woff', weight: '700', style: 'italic' },
  ],
  variable: '--font-base-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

// Dot-matrix face used only by the animated Base logo, where the wordmark first
// spells out in dots before resolving into Base Sans. Same binary base.org ships
// (a variable TTF instanced to Doto Black), so the two render identically.
const doto = localFont({
  src: '../public/fonts/Doto/Doto-Black.ttf',
  variable: '--font-doto',
  display: 'swap',
  adjustFontFallback: false,
});

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
      className={`${baseSans.variable} ${baseSansText.variable} ${baseSansMono.variable} ${doto.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
        <Analytics />
      </body>
    </html>
  );
}
