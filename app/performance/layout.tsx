import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { PERFORMANCE_ENABLED } from './flag';

// Metadata for the Performance section. The app-wide chrome (sidebar, header)
// comes from AppShell; this layout constrains the content column, matching
// Internal Explorer / Vibenet rather than Benchmark's slate backdrop.
export const metadata: Metadata = {
  title: 'Performance · Base Chain',
  description:
    'Latest swap and transfer load-test throughput and latency for Base chain.',
};

export default function PerformanceLayout({ children }: { children: ReactNode }) {
  // Server guard: 404 the whole /performance subtree on a direct visit when the
  // section is disabled. With the flag off this branch is a compile-time
  // constant, so the section is unreachable in the public build.
  if (!PERFORMANCE_ENABLED) notFound();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">{children}</div>
  );
}
