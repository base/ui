import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Unlisted: not in the catalogue, nav, or sitemap, and asked not to be indexed.
export const metadata: Metadata = {
  title: 'Block Runner · Vibenet',
  description: 'A pixel runner paced by vibenet’s 200 ms blocks. Swallow a block to read its number and slot.',
  robots: { index: false, follow: false },
};

export default function BlockRunnerLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
