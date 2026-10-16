import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Liquidations · Validity Transactions',
  description:
    'Liquidate under-collateralized loans on a demo lending market before a rival keeper, with a validity transaction that waits for the price to cross.',
};

export default function LiquidationsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
