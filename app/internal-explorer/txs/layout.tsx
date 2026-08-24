import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { EXPLORER_LABEL } from '../flag';

export const metadata: Metadata = {
  title: `Transactions · ${EXPLORER_LABEL}`,
  description: 'Browse confirmed Base transactions from newest to oldest.',
};

export default function ExplorerTxsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
