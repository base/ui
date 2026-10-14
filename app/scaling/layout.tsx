import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { SCALING_ENABLED } from './flag';

export const metadata: Metadata = {
  title: 'Scaling · Base Chain',
  description: 'Internal scaling scorecard: observed load, configured limits, and missing capacity evidence.',
};

export default function ScalingLayout({ children }: { children: ReactNode }) {
  // Backstop for the middleware 404: compile-time constant in the public build.
  if (!SCALING_ENABLED) notFound();
  return <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">{children}</div>;
}
