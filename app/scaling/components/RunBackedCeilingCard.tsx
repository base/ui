'use client';

import useSWR from 'swr';

import { daWorkloads, withDaWorkloads } from '../da/workloads';
import { getDataService } from '../runs/lib/dataService';
import { getTestRunsWithStatus, type BenchmarkRuns, type BenchmarkRunWithStatus } from '../runs/lib/types';
import { toUnifiedRun } from '../runs/lib/unified';
import type { Ceiling } from '../snapshot.mjs';
import { CeilingCard } from './CeilingCards';
import { useProvenCapacity } from './ProvenCapacity';

const gps = (r: BenchmarkRunWithStatus) => r.result?.sequencerMetrics?.gasPerSecond ?? 0;

// One benchmark run can test several configurations; its ceiling is the fastest one that passed.
function newestPassing(metadata: BenchmarkRuns): BenchmarkRunWithStatus | undefined {
  const passing = getTestRunsWithStatus(metadata).filter((r) => r.status === 'success' && gps(r) > 0);
  const newest = passing.toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return newest && passing.filter((r) => r.testConfig.BenchmarkRun === newest.testConfig.BenchmarkRun).reduce((a, b) => (gps(b) > gps(a) ? b : a));
}

// No producer records state size yet, so a bench run can only estimate the execution ceiling.
const fromRun = (c: Ceiling, run: BenchmarkRunWithStatus): Ceiling => ({
  ...c,
  value: gps(run) / 1e6,
  tag: 'estimated',
  formula: 'sequencer gas/s of the newest passing bench run',
  inputs: [
    { name: 'bench_run', value: `${run.testConfig.BenchmarkRun}`, unit: '', asOf: run.createdAt, status: 'observed' },
    { name: 'state_size', value: null, unit: '', asOf: null, status: 'pending' },
  ],
  reason: 'state size not recorded',
});

export function RunBackedCeilingCard({ area, ceilings: snapshotCeilings, benchUrl }: { area: Ceiling['area']; ceilings: Ceiling[]; benchUrl?: string }) {
  const { data } = useSWR('scaling-bench-metadata', () => getDataService().getMetadata());
  const bench = useProvenCapacity(benchUrl);
  const loaded = bench.error ? undefined : bench.data;
  const workloads = daWorkloads(loaded?.da);
  const ceilings = loaded ? withDaWorkloads(snapshotCeilings, workloads) : snapshotCeilings;
  const run = data && newestPassing(data);
  const execution = ceilings.find((c) => c.area === 'execution')!;
  // A measured or modeled snapshot value outranks a run-backed estimate; the snapshot is also the fallback without the API.
  if (!run || execution.tag === 'measured' || execution.tag === 'modeled') return <CeilingCard area={area} ceilings={ceilings} workloads={workloads} />;
  const live = ceilings.map((c) => (c === execution ? fromRun(c, run) : c));
  return <CeilingCard area={area} ceilings={live} workloads={workloads} run={area === 'execution' ? toUnifiedRun(run) : undefined} />;
}
