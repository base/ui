'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import useSWR from 'swr';

import { Card } from '../../../../../components/ui/Card';
import { EmptyState } from '../../../../../components/ui/EmptyState';
import { Text } from '../../../../../components/ui/Text';
import { Info } from '../../../../components/Info';
import { LineChart } from '../../../components/LineChart';
import { Crumbs, Section, Status } from '../../../components/parts';
import { getDataService } from '../../../lib/dataService';
import { durationToNanos, formatDuration, formatEthFromWei, formatLoadTestTimestamp, formatTransactions, formatValue } from '../../../lib/formatters';
import type { FlashblocksLatencyStats, LatencyStats, LoadTestResult } from '../../../lib/types';

const mgas = (gps: number) => (gps / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 });
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

export function LoadRun({ network, timestamp }: { network: string; timestamp: string }) {
  const { data: result, error } = useSWR(['scaling-load-result', network, timestamp], () => getDataService().getLoadTestResult(network, timestamp));
  const { data: list } = useSWR(['scaling-load-list', network], () => getDataService().getLoadTestList(network));
  // The list is newest first.
  const at = list?.findIndex((e) => e.timestamp === timestamp) ?? -1;
  const step = (i: number, label: string) => {
    const e = at >= 0 ? list?.[i] : undefined;
    return e ? <Link className="underline" href={`/scaling/runs/load/${e.network}/${e.timestamp}`}>{label}</Link> : <span className="text-bds-gray-40">{label}</span>;
  };

  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="flex flex-col gap-3">
        <Crumbs here={`${network} ${timestamp}`} />
        <Text as="h1" variant="title2">Load test · {network} · {formatLoadTestTimestamp(timestamp)} UTC</Text>
        <Text variant="label.regular" tone="muted"><span className="flex gap-4">{step(at + 1, '← Previous run')}{step(at - 1, 'Next run →')}</span></Text>
      </header>
      {error ? (
        <EmptyState title="Load test could not be loaded" description={error instanceof Error ? error.message : String(error)} />
      ) : !result ? (
        <Text tone="muted">Loading load test…</Text>
      ) : <Report result={result} />}
    </div>
  );
}

function Report({ result: r }: { result: LoadTestResult }) {
  const { config: c, throughput: t } = r;
  const gasPerTx = t && t.total_confirmed > 0 ? r.gas.total_gas / t.total_confirmed : null;
  return (
    <>
      {r.error ? <Card className="bg-background p-4 text-[13px] dark:bg-white/5"><Status status="fatal" /><p className="mt-1 font-mono">{r.error}</p></Card> : null}
      {t ? (
        <Card className="flex flex-col gap-3 bg-background p-4 text-[13px] dark:bg-white/5">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span><span className="font-mono text-[32px]">{mgas(t.gps)}</span> <span className="text-bds-gray-60">Mgas/s observed</span></span>
            {gasPerTx && c ? <span className="text-bds-gray-60">≈ {n(t.gps / gasPerTx)} tx/s at this mix: {formatTransactions(c)}</span> : null}
          </div>
          {c ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-bds-gray-60">
              <span>target {mgas(c.target_gps)} Mgas/s</span><span>{c.duration}</span><span>{c.sender_count} senders</span><span>{c.in_flight_per_sender} in flight each</span>
              <Info label="Full run config"><pre className="whitespace-pre-wrap break-all font-mono text-[11px]">{JSON.stringify(c, null, 2)}</pre></Info>
            </div>
          ) : null}
        </Card>
      ) : null}
      {r.throughput_timeseries && r.throughput_timeseries.length > 1 ? (
        <Section title="Throughput over time">
          <LineChart title="Gas per second" unit="gas/s" xLabel={(x) => `${x.toFixed(0)} s`}
            series={[{ name: 'gas/s', stroke: 'stroke-base-blue', dot: 'bg-base-blue', points: r.throughput_timeseries.map((s) => [s.elapsed_secs, s.gps]) }]} />
        </Section>
      ) : null}
      {r.block_latency ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Section title="Block latency"><Percentiles stats={r.block_latency} /></Section>
          <Section title={`Flashblocks latency · ${n(r.flashblocks_latency.count)} samples`}><Percentiles stats={r.flashblocks_latency} /></Section>
        </div>
      ) : null}
      {t ? (
        <Section title="Gas and transactions">
          <Card className="grid grid-cols-2 gap-3 bg-background p-4 text-[13px] sm:grid-cols-4 dark:bg-white/5">
            <Stat label="Total gas">{formatValue(r.gas.total_gas, 'gas')}</Stat>
            <Stat label="Avg gas per tx">{n(r.gas.avg_gas)}</Stat>
            <Stat label="Avg gas price">{n(r.gas.avg_gas_price)} wei</Stat>
            <Stat label="Total cost">{formatEthFromWei(r.gas.total_cost_wei)}</Stat>
            <Stat label="Submitted">{n(t.total_submitted)}</Stat>
            <Stat label="Confirmed">{n(t.total_confirmed)}</Stat>
            <Stat label="Failed">{n(t.total_failed)}</Stat>
            <Stat label="Blocks">{r.block_range ? n(r.block_range.block_count) : '—'}</Stat>
          </Card>
        </Section>
      ) : null}
      {t ? <Section title="Failure reasons"><Failures result={r} /></Section> : null}
    </>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col"><span className="text-[12px] text-bds-gray-60">{label}</span><span className="font-mono">{children}</span></div>;
}

function Percentiles({ stats }: { stats: LatencyStats | FlashblocksLatencyStats }) {
  const rows = (['min', 'p50', 'mean', 'p90', 'p95', 'p99', 'max'] as const).flatMap((k) => (k in stats ? [[k, (stats as FlashblocksLatencyStats)[k]] as const] : []));
  const max = durationToNanos(stats.max) || 1;
  return (
    <Card className="flex flex-col gap-2 bg-background p-4 text-[13px] dark:bg-white/5">
      {rows.map(([k, d]) => (
        <div key={k} className="grid grid-cols-[3rem_1fr_5rem] items-center gap-3">
          <span className="font-mono text-[12px] text-bds-gray-60">{k}</span>
          <span className="h-2 overflow-hidden rounded-full bg-bds-gray-10 dark:bg-white/10"><span className="block h-full bg-base-blue" style={{ width: `${(100 * durationToNanos(d)) / max}%` }} /></span>
          <span className="text-right font-mono">{formatDuration(d)}</span>
        </div>
      ))}
    </Card>
  );
}

function Failures({ result: r }: { result: LoadTestResult }) {
  const reasons = [...(r.throughput.total_reverted > 0 ? [['reverted', r.throughput.total_reverted] as const] : []), ...r.top_failure_reasons];
  if (!reasons.length) return <Text tone="muted">No failures recorded.</Text>;
  return (
    <Card className="divide-y divide-bds-gray-10 bg-background text-[13px] dark:divide-white/10 dark:bg-white/5">
      {reasons.map(([reason, count]) => <div key={reason} className="flex justify-between gap-4 px-4 py-2"><span>{reason}</span><span className="font-mono">{n(count)}</span></div>)}
    </Card>
  );
}
