import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '200ms Blocks · Vibenet',
  description: 'Experience Vibenet’s native 200 ms blocks through interactive demos built for the Base Denim upgrade.',
};

export default function Blocks200Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
