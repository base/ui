import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { TIPS_ENABLED, TIPS_LABEL } from './flag';

// Metadata for Internal Explorer. The app-wide chrome (sidebar, header)
// comes from AppShell; this layout just constrains the content column, matching
// the Vibenet section's treatment.
export const metadata: Metadata = {
  title: `${TIPS_LABEL} · Base Chain`,
  description:
    'Inspect blocks, bundles, transactions, and rejected transactions across Base chains.',
};

export default function TipsLayout({ children }: { children: ReactNode }) {
  // Server guard: 404 the whole /internal-explorer subtree on a direct visit
  // when Internal Explorer is disabled. With the flag off this branch is a
  // compile-time constant, so the section is unreachable in the public build.
  if (!TIPS_ENABLED) notFound();
  return <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">{children}</div>;
}
