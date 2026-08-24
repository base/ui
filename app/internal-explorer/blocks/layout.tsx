import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { TIPS_LABEL } from '../flag';

export const metadata: Metadata = {
  title: `Blocks · ${TIPS_LABEL}`,
  description: 'Browse recent Base blocks and their execution limits.',
};

export default function TipsBlocksLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
