import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'B20 Demo · Vibenet',
  description: 'Inspect, configure, and issue Base-native B20 tokens on Vibenet.',
};

export default function B20DemoLayout({ children }: { children: ReactNode }) {
  return children;
}
