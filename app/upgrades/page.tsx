import type { Metadata } from 'next';

import { UpgradesClient } from './UpgradesClient';

export const metadata: Metadata = {
  title: 'Upgrades · Base Chain',
  description:
    'Track Base network upgrades and their activation status across Base Sepolia and Mainnet.',
  alternates: {
    canonical: '/upgrades',
  },
};

export const revalidate = 300;

export default function UpgradesPage() {
  return <UpgradesClient />;
}
