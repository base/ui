'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';

import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { EmptyState } from '../../components/ui/EmptyState';
import { Text } from '../../components/ui/Text';
import { Info } from '../components/Info';
import { Tag } from '../components/Tag';
import { getDataService } from './lib/dataService';
import { formatValue } from './lib/formatters';
import { getTestRunsWithStatus, type RunStatus } from './lib/types';
import { toUnifiedRun, weekOf, type UnifiedRun } from './lib/unified';

// report-api has no endpoint listing load-test networks.
const NETWORK = 'sepolia';
// One request per load-test result; nightly runs grow without bound.
const LOAD_LIMIT = 30;

const TH = 'px-3 py-2 text-left text-[12px] font-[500] text-bds-gray-60';
const TD = 'px-3 py-2 align-top';
const DOT: Record<RunStatus, string> = { success: 'bg-bds-green-50', warning: 'bg-bds-yellow-50', error: 'bg-bds-red-50', fatal: 'bg-bds-red-50', incomplete: 'bg-bds-gray-30' };

async function loadRuns() {
  const api = getDataService();
  const [metadata, entries] = await Promise.all([api.getMetadata(), api.getLoadTestList(NETWORK)]);
  const recent = entries.slice(0, LOAD_LIMIT);
  // A missing result leaves that row's metrics unknown instead of failing the whole index.
  const results = await Promise.all(recent.map((e) => api.getLoadTestResult(e.network, e.timestamp).catch(() => undefined)));
  const runs = [...getTestRunsWithStatus(metadata), ...recent.map((e, i) => ({ ...e, result: results[i] }))].map(toUnifiedRun);
  runs.sort((a, b) => b.timestamp - a.timestamp);
  return { runs, loadTotal: entries.length };
}

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
        <Card className="overflow-x-auto bg-background dark:bg-white/5">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-bds-gray-10 dark:border-white/10">
                {['When', 'Kind', 'Env', 'Profile', 'Workload', 'Mgas/s', 'Latency', 'Status', 'Duration', 'Machine'].map((h) => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            {[...weeks].map(([week, rows]) => (
              <tbody key={week}>
                <tr className="bg-bds-gray-5 dark:bg-white/5"><th colSpan={10} className={TH}>Week of {week}</th></tr>
                {rows.map((r) => <Row key={r.href} run={r} />)}
              </tbody>
            ))}
          </table>
        </Card>
      )}
    </div>
  );
}

function Row({ run: r }: { run: UnifiedRun }) {
  return (
    <tr className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
      <td className={cn(TD, 'whitespace-nowrap font-mono')}><Link className="underline" href={r.href}>{new Date(r.timestamp).toISOString().slice(0, 16).replace('T', ' ')}</Link></td>
      <td className={TD}><Tag tag={r.kind} /></td>
      <td className={TD}>{r.env}</td>
      <td className={TD}><span className="flex items-center gap-1">{r.profile ? <Tag tag={r.profile} /> : '—'}<Info label="Why this run does not qualify">{r.qualifies.reason}</Info></span></td>
      <td className={TD}>{r.workload}</td>
      <td className={cn(TD, 'font-mono')}>{r.gasPerSecond === null ? '—' : (r.gasPerSecond / 1e6).toFixed(1)}</td>
      <td className={cn(TD, 'whitespace-nowrap font-mono')}>
        {r.latency.length ? r.latency.map((l) => <div key={l.label}>{l.label} {formatValue(l.seconds, 's')}</div>) : '—'}
      </td>
      <td className={cn(TD, 'whitespace-nowrap')}>
        <span className="flex items-center gap-2"><span aria-hidden="true" className={cn('h-2 w-2 rounded-full', r.status ? DOT[r.status] : 'bg-bds-gray-30')} />{r.status ?? 'unknown'}</span>
      </td>
      <td className={cn(TD, 'font-mono')}>{r.duration === null ? '—' : formatValue(r.duration, 's')}</td>
      <td className={TD}>{r.machine ?? '—'}</td>
    </tr>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  const tone = on ? 'border-base-blue text-base-blue' : 'border-bds-gray-20 text-bds-gray-60';
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn('rounded-full border px-3 py-1 text-[12px]', tone)}>{children}</button>;
}
