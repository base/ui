import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Race the Agent · Validity Transactions',
  description:
    'Compare a manually timed VIBE withdrawal with a validity transaction that is already waiting for its onchain condition.',
};

export default function RaceTheAgentLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
