import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { TIPS_LABEL } from '../flag';

export const metadata: Metadata = {
  title: `Transactions · ${TIPS_LABEL}`,
  description: 'Browse confirmed Base transactions from newest to oldest.',
};

export default function TipsTxsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
