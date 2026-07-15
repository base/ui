import './globals.css';

import { PropsWithChildren } from 'react';
import localFont from 'next/font/local';

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

export const metadata = {
  title: 'Base Labs',
  description: 'Dashboards and stats for the Base network, in one place.',
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html
      lang="en"
      className={`${baseSans.variable} ${baseSansText.variable} ${baseSansMono.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
