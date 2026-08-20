import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { SHADOW_EXPLORER_ENABLED } from './flag';

export const metadata: Metadata = {
  title: 'Shadow Explorer · Base Chain',
  description:
    'Explore shadow chains per network: reorged-out shadow candidate blocks paired with the canonical block that replaced them, with gas and transaction deltas.',
};

export default function ShadowExplorerLayout({ children }: { children: ReactNode }) {
  // Server guard: 404 the whole /shadow-explorer subtree on a direct visit when
  // the section is disabled. With the flag off this branch is a compile-time
  // constant, so the section is unreachable in the public build.
  if (!SHADOW_EXPLORER_ENABLED) notFound();
  return <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">{children}</div>;
}
