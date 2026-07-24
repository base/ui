import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The account demo page is a client component; this passthrough layout carries
// its title/description. The nested /build route sets its own metadata.
export const metadata: Metadata = {
  title: 'EIP-8130 · Vibenet',
  description:
    'Create native account abstraction accounts from in-browser keys, fund them from the faucet, and inspect balances on Vibenet..',
};

export default function AccountDemoLayout({ children }: { children: ReactNode }) {
  return children;
}
