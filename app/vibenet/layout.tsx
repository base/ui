import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { MaintenanceBanner } from './components/MaintenanceBanner';

// Default metadata for the Vibenet section; the overview route (/vibenet) uses
// it directly, and nested routes override title/description in their own
// segments.
export const metadata: Metadata = {
  title: 'Vibenet · Base Chain',
  description:
    'Explore Vibenet, the Base devnet for testing in-flight protocol features.',
};

type VibenetLayoutProps = {
  children: ReactNode;
};

export default function VibenetLayout({ children }: VibenetLayoutProps) {
  return (
    <div className="flex w-full flex-1 flex-col">
      <MaintenanceBanner />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
