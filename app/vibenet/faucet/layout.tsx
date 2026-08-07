import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The faucet page is a client component; this passthrough layout carries its
// title/description (overriding the Vibenet section defaults).
export const metadata: Metadata = {
  title: 'Faucet · Vibenet',
  description:
    'Request testnet tokens on Vibenet to fund accounts and try in-flight Base features.',
};

export default function FaucetLayout({ children }: { children: ReactNode }) {
  return children;
}
