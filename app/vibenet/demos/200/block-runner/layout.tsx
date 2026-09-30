import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Block Runner · 200ms Blocks',
  description: 'A pixel runner paced by Vibenet’s 200 ms blocks. Swallow a block to read its number and slot.',
  robots: { index: false, follow: false },
};

export default function BlockRunnerLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
