import type { Metadata } from 'next';
import { Suspense } from 'react';

import { UpgradesClient } from './UpgradesClient';
import UpgradesLoading from './loading';

export const metadata: Metadata = {
  title: 'Upgrades · Base Chain',
  description:
    'Track Base network upgrades and search protocol changes across Base Sepolia and Mainnet.',
  alternates: {
    canonical: '/upgrades',
  },
};

export const revalidate = 300;

export default function UpgradesPage() {
  // UpgradesClient reads useSearchParams (to sync the grid/timeline/changelog
  // tab with `?tab=`), which needs a Suspense boundary per Next 15 App Router.
  return (
    <Suspense fallback={<UpgradesLoading />}>
      <UpgradesClient />
    </Suspense>
  );
}
