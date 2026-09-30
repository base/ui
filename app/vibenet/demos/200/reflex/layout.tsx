import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Reflex · 200ms Blocks',
  description: 'Race your reaction time against a real transaction landing in a native 200 ms Vibenet block.',
};

export default function ReflexLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
