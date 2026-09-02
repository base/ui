import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Conditional Swaps · Validity Transactions',
  description:
    'Place a validity-backed swap on Vibenet that waits for a target price, then fills or expires as the market moves.',
};

export default function ConditionalSwapsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
