import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { MaintenanceBanner } from '../../vibenet/components/MaintenanceBanner';

// The account demo page is a client component; this passthrough layout carries
// its title/description.
export const metadata: Metadata = {
  title: 'EIP-8130 · Base Chain',
  description:
    'Create native account abstraction accounts from in-browser keys, fund them from the faucet, and inspect balances on Vibenet.',
};

// This demo runs on Vibenet, so it carries Vibenet's maintenance notice — the
// demo is unusable while the devnet is down. Scoped here rather than to the
// /demos section, since other demos may run on other test networks.
export default function AccountDemoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MaintenanceBanner />
      {children}
    </>
  );
}
