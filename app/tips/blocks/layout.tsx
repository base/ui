import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Blocks · TIPS',
  description: 'Browse recent Base blocks and their execution limits.',
};

export default function TipsBlocksLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
