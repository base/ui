'use client';

import Link from 'next/link';
import useSWR from 'swr';

import { EmptyState } from '../../components/ui/EmptyState';
import { Text } from '../../components/ui/Text';
import { RunTable } from '../runs/components/RunTable';
import { loadRuns } from '../runs/lib/runIndex';
import { weekOf } from '../runs/lib/unified';
import type { Ceiling } from '../snapshot.mjs';

const PER_KIND = 5;

export function RelatedRuns({ area }: { area: Ceiling['area'] }) {
  const { data, error } = useSWR('scaling-runs', loadRuns);
  const related = (data?.runs ?? []).filter((r) => (r.areas as string[]).includes(area));
  // Load tests run nightly and bench runs monthly, so cap each kind or bench runs never show.
  const runs = (['bench', 'load'] as const).flatMap((k) => related.filter((r) => r.kind === k).slice(0, PER_KIND)).sort((a, b) => b.timestamp - a.timestamp);
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline"><Link className="underline" href="/scaling/runs">Related runs →</Link></Text>
      {error ? (
        <EmptyState title="Runs could not be loaded" description={error instanceof Error ? error.message : String(error)} />
      ) : !data ? (
        <Text tone="muted">Loading runs…</Text>
      ) : runs.length ? (
        <RunTable weeks={Map.groupBy(runs, (r) => weekOf(r.timestamp))} />
      ) : (
        <EmptyState description="No bench run or load test covers this area." />
      )}
    </section>
  );
}
