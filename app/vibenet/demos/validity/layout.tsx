import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Validity Transactions · Vibenet',
  description:
    'Explore Vibenet demos built with transactions that execute only while their onchain validity conditions hold.',
};

export default function ValidityTransactionsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
