import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Explorer · Vibenet',
  description:
    'Browse blocks, transactions, and addresses on the Vibenet devnet.',
};

type ExplorerLayoutProps = {
  children: ReactNode;
};

export default function ExplorerLayout({ children }: ExplorerLayoutProps) {
  return (
    <div className="flex flex-col gap-8 text-black dark:text-white">
      {children}
    </div>
  );
}
