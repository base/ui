import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Validity · Vibenet',
  description:
    'Attach conditions to a transaction. A simulated pool shows how a swap waits, lands, or expires.',
};

export default function ValidityDemoLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
