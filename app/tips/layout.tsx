import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { TIPS_ENABLED } from './flag';

// Metadata for the TIPS section. The app-wide chrome (sidebar, header) comes
// from AppShell; this layout just constrains the content column, matching the
// Vibenet section's treatment.
export const metadata: Metadata = {
  title: 'TIPS · Base Chain',
  description:
    'Inspect TIPS blocks, bundles, transactions, and rejected transactions across Base chains.',
};

export default function TipsLayout({ children }: { children: ReactNode }) {
  // Server guard: 404 the whole /tips subtree on a direct visit when TIPS is
  // disabled. With the flag off this branch is a compile-time constant, so the
  // section is unreachable in the public build.
  if (!TIPS_ENABLED) notFound();
  return <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">{children}</div>;
}
