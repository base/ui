import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { EXPLORER_LABEL } from '../flag';

export const metadata: Metadata = {
  title: `Blocks · ${EXPLORER_LABEL}`,
  description: 'Browse recent Base blocks and their execution limits.',
};

export default function ExplorerBlocksLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
