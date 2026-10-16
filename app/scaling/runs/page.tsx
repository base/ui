'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';

import { cn } from '../../components/ui/cn';
import { EmptyState } from '../../components/ui/EmptyState';
import { Text } from '../../components/ui/Text';
import { RunTable } from './components/RunTable';
import { LOAD_LIMIT, loadRuns } from './lib/runIndex';
import { weekOf, type UnifiedRun } from './lib/unified';

export default function RunsPage() {
  const { data, error } = useSWR('scaling-runs', loadRuns);
  const [kind, setKind] = useState<UnifiedRun['kind'] | null>(null);
  const [env, setEnv] = useState<string | null>(null);
  const [qualifying, setQualifying] = useState(false);

  const runs = (data?.runs ?? []).filter((r) => (!kind || r.kind === kind) && (!env || r.env === env) && (!qualifying || r.qualifies.ok));
  const weeks = Map.groupBy(runs, (r) => weekOf(r.timestamp));
  const envs = [...new Set(data?.runs.map((r) => r.env))];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="flex flex-col gap-3">
        <Text variant="label.regular" tone="muted"><Link className="underline" href="/scaling">Scaling</Link> / Runs</Text>
        <Text as="h1" variant="title2">Runs</Text>
        <Text variant="label.regular" tone="muted">Base-bench runs and {data ? `the latest ${Math.min(LOAD_LIMIT, data.loadTotal)} of ${data.loadTotal}` : 'the latest'} load tests, newest first.</Text>
      </header>
      <div className="flex flex-wrap gap-2">
        {([null, 'bench', 'load'] as const).map((k) => <Chip key={k ?? 'all'} on={kind === k} onClick={() => setKind(k)}>{k ?? 'all kinds'}</Chip>)}
        {[null, ...envs].map((e) => <Chip key={e ?? 'all'} on={env === e} onClick={() => setEnv(e)}>{e ?? 'all envs'}</Chip>)}
        <Chip on={qualifying} onClick={() => setQualifying(!qualifying)}>qualifying only</Chip>
      </div>
      {error ? (
        <EmptyState title="Runs could not be loaded" description={error instanceof Error ? error.message : String(error)} />
      ) : !data ? (
        <Text tone="muted">Loading runs…</Text>
      ) : runs.length === 0 ? (
        <EmptyState description={qualifying ? 'No run qualifies as sustained-capacity evidence yet.' : 'No runs match these filters.'} />
      ) : (
        <RunTable weeks={weeks} />
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  const tone = on ? 'border-base-blue text-base-blue' : 'border-bds-gray-20 text-bds-gray-60';
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn('rounded-full border px-3 py-1 text-[12px]', tone)}>{children}</button>;
}
