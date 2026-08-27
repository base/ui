import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Title convention: a page inside a section is "{Page} · {Section}".
export const metadata: Metadata = {
  title: 'Tokens · Vibenet',
  description: 'Explore, configure, and issue Base-native B20 tokens on Vibenet.',
};

// Passthrough. The demo runs on Vibenet and lives under /vibenet/demos, so it
// inherits Vibenet's maintenance notice from app/vibenet/layout.tsx.
export default function B20DemoLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
