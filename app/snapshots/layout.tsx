import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The snapshots page is a client component and can't export metadata itself,
// so this passthrough layout carries the segment's title/description.
export const metadata: Metadata = {
  title: 'Snapshots · Base Chain',
  description:
    'Download the latest Base node snapshots for Mainnet and Base Sepolia to sync a node quickly.',
  alternates: {
    canonical: '/snapshots',
  },
};

export default function SnapshotsLayout({ children }: { children: ReactNode }) {
  return children;
}
