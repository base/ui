'use client';

import useSWR from 'swr';

import { Status } from '../runs/components/parts';
import { getDataService } from '../runs/lib/dataService';
import { getTestRunsWithStatus } from '../runs/lib/types';
import { toUnifiedRun } from '../runs/lib/unified';
import { RUN_PAGE } from '../snapshot.mjs';

export function RunEvidence({ url }: { url: string }) {
  const [, id, network, timestamp] = url.match(RUN_PAGE) ?? [];
  const { data: metadata } = useSWR(id ? 'scaling-bench-metadata' : null, () => getDataService().getMetadata());
  const { data: result } = useSWR(network ? ['scaling-load-result', network, timestamp] : null, () => getDataService().getLoadTestResult(network, timestamp));
  const runs = id
    ? getTestRunsWithStatus({ runs: metadata?.runs.filter((r) => `${r.testConfig.BenchmarkRun}` === id) ?? [] }).map(toUnifiedRun)
    : result ? [toUnifiedRun({ network, timestamp, result })] : [];
  return (
    <span className="flex flex-wrap gap-x-4 text-bds-gray-60 empty:hidden">
      {runs.map((r, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="font-mono">{r.gasPerSecond === null ? '—' : (r.gasPerSecond / 1e6).toFixed(1)} Mgas/s</span>
          <Status status={r.status ?? 'unknown'} />
        </span>
      ))}
    </span>
  );
}
