import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Unlisted: reached from the inclusion line in transaction popups, not the
// catalogue grid, nav, or sitemap.
export const metadata: Metadata = {
  title: 'Reflex · Vibenet',
  description: 'Race your reaction time against a real transaction landing in a native 200 ms Vibenet block.',
  robots: { index: false, follow: false },
};

export default function ReflexLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
