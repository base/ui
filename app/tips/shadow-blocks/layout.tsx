import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Shadow Blocks · TIPS',
  description:
    'Reorged-out shadow candidate blocks paired with the canonical block that replaced them, with gas and transaction deltas.',
};

export default function TipsShadowBlocksLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
