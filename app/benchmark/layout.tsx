import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import ErrorBoundary from './components/ErrorBoundary';
import { BENCHMARK_ENABLED } from './flag';
import './benchmark.css';

// Metadata for the Benchmark section. The app-wide chrome (sidebar, header)
// comes from AppShell; this layout adds the section's own slate backdrop and the
// error boundary that upstream (base/benchmark) had wrapped around its router.
export const metadata: Metadata = {
  title: 'Benchmark · Base Chain',
  description:
    'Node benchmark runs and load test results for Base chain: throughput, latency percentiles, and per-run comparisons.',
};

export default function BenchmarkLayout({ children }: { children: ReactNode }) {
  // Server guard: 404 the whole /benchmark subtree on a direct visit when the
  // section is disabled. With the flag off this branch is a compile-time
  // constant, so the section is unreachable in the public build.
  if (!BENCHMARK_ENABLED) notFound();
  return (
    <div className="benchmark-root flex flex-1 flex-col">
      <ErrorBoundary>{children}</ErrorBoundary>
    </div>
  );
}
