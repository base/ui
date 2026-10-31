'use client';

import Link from 'next/link';

import { cn } from '../../components/ui/cn';
import { Card } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import { proofLimits, type Run } from '../proven/capacity';
import type { Guardrail } from '../snapshot.mjs';
import { useProvenCapacity, usageAsOf } from './ProvenCapacity';
import { Tag } from './Tag';

const TH = 'px-4 py-2 text-left text-[12px] font-[500] text-bds-gray-60';
const TD = 'px-4 py-3 align-top';
const DOT: Record<Guardrail['status'], string> = { ok: 'bg-bds-green-50', breached: 'bg-bds-red-50', unknown: 'bg-bds-gray-30', 'not-monitored': 'bg-bds-gray-30' };
const STATUS: Record<Guardrail['status'], string> = { ok: 'OK', breached: 'Breached', unknown: 'Unknown', 'not-monitored': 'Not monitored' };

const fmt = (n: number, unit: string) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`.trim();

export const KEEP_UP_BLOCKS = 3;
export const REPLAY_BLOCKS_PER_SECOND = 5;

const judge = (g: Omit<Guardrail, 'status'>): Guardrail => ({
  ...g,
  status: g.value === null || g.threshold === null ? 'unknown' : (g.comparator === '<=' ? g.value <= g.threshold : g.value >= g.threshold) ? 'ok' : 'breached',
});

// Production validators may trail the tip by at most 3 blocks. `run` is the qualifying mainnet-mix
// bench run: undefined without a bench host, null when none is loaded.
export function scorecardGuardrails(snapshot: Guardrail[], run: Run | null | undefined): Guardrail[] {
  const keepUp = (g?: Guardrail) => judge({
    id: 'validator-keep-up', label: 'Validator keep-up', value: g?.value ?? null, unit: 'blocks', threshold: KEEP_UP_BLOCKS, comparator: '<=',
    thresholdTag: 'set', owner: g?.owner ?? null, asOf: g?.asOf ?? null,
    help: `How far production validators trail the tip, from the snapshot. They must stay within ${KEEP_UP_BLOCKS} blocks.`,
  });
  const rows = snapshot.some((g) => g.id === 'validator-keep-up')
    ? snapshot.map((g) => (g.id === 'validator-keep-up' ? keepUp(g) : g))
    : [...snapshot, keepUp()];
  if (run === undefined) return rows;
  const source = run ? ` From bench run ${run.outputDir}.` : ' No qualifying mainnet-mix bench run is loaded.';
  const bench = { comparator: '<=' as const, threshold: null, thresholdTag: 'unset' as const, owner: null, asOf: run ? new Date(run.createdAt).toISOString() : null };
  // Budgets come from the run; an older run has none, so its proof rows stay unknown.
  const limits = run ? proofLimits(run) : null;
  const budget = limits ? { thresholdTag: 'set' as const } : {};
  return [
    ...rows,
    judge({
      ...bench, ...budget, id: 'proof-history-headroom', label: 'Proof history headroom', value: limits?.proofHistory.headroom ?? null, unit: '×',
      comparator: '>=', threshold: limits?.proofHistory.minHeadroom ?? null,
      help: `Proof history throughput ÷ the chain's real-time block rate while the proof node replays the bench blocks.${source}`,
    }),
    judge({
      ...bench, ...budget, id: 'proof-node-execute-payload', label: 'debug_executePayload p99', value: run?.proofNode?.proofs?.methods.debug_executePayload?.latency.p99Ms ?? null, unit: 'ms',
      threshold: limits?.witnessGeneration.maxP99Ms ?? null,
      help: `Latency of the witness call the prover makes for each block, on the proof node.${source}`,
    }),
    judge({
      ...bench, id: 'validator-replay-headroom', label: 'Validator replay headroom', value: run?.replay?.blocksPerSecond ?? null, unit: 'blocks/s',
      comparator: '>=', threshold: REPLAY_BLOCKS_PER_SECOND, thresholdTag: 'set',
      help: `Blocks per second a validator replays the bench blocks at. Keeping up needs ${REPLAY_BLOCKS_PER_SECOND}, one block per ${1000 / REPLAY_BLOCKS_PER_SECOND} ms.${source}`,
    }),
  ];
}

function Table({ rows }: { rows: Guardrail[] }) {
  return (
    <Card className="overflow-x-auto bg-background dark:bg-white/5">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-bds-gray-10 dark:border-white/10">
            <th className={TH}>Guardrail</th>
            <th className={TH}>Value</th>
            <th className={TH}>Threshold</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id} className={cn('border-b border-bds-gray-10 last:border-0 dark:border-white/10', g.status === 'not-monitored' && 'text-bds-gray-60')}>
              <td className={TD}>
                {g.label}<p className="text-bds-gray-60">{g.help}</p>
              </td>
              <td className={cn(TD, 'whitespace-nowrap font-mono')}>{g.value === null ? '—' : fmt(g.value, g.unit)}</td>
              <td className={TD}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap font-mono">{g.threshold === null ? '—' : `${g.comparator === '<=' ? '≤' : '≥'} ${fmt(g.threshold, g.unit)}`}</span>
                  {g.thresholdTag === 'set' ? null : <Tag tag={g.thresholdTag} />}
                  {g.owner ? <span className="text-bds-gray-60">{g.owner}</span> : null}
                </span>
              </td>
              <td className={cn(TD, 'whitespace-nowrap')}>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', DOT[g.status])} />
                  {STATUS[g.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// The scorecard shows counts; the guardrails page shows breached and met rows, with the rest collapsed.
export function Guardrails({ guardrails, collectedAt, detailed = false, benchUrl }: { guardrails: Guardrail[]; collectedAt: string; detailed?: boolean; benchUrl?: string }) {
  const bench = useProvenCapacity(benchUrl);
  const run = benchUrl ? (bench.error ? null : bench.data?.current.mix?.run ?? null) : undefined;
  const rows = scorecardGuardrails(guardrails, run);
  const breached = rows.filter((g) => g.status === 'breached');
  const met = rows.filter((g) => g.status === 'ok');
  const unmeasured = rows.filter((g) => g.status === 'unknown' || g.status === 'not-monitored');
  const summary = <summary className="cursor-pointer text-bds-gray-60">Not measured {unmeasured.length}</summary>;
  if (!detailed) {
    return (
      <section className="flex flex-col gap-2">
        <Text as="h2" variant="headline">Guardrails</Text>
        <div className="flex flex-wrap items-start gap-x-5 gap-y-1 text-[13px]">
          <span className={breached.length ? 'text-bds-red-60' : 'text-bds-gray-60'}>
            Breached {breached.length}
            {breached.map((g, i) => <span key={g.id}>{i ? ', ' : ' — '}{g.label} <b className="tabular-nums">{fmt(g.value!, g.unit)}</b></span>)}
          </span>
          <span className="text-bds-green-60">Met {met.length}</span>
          <details>
            {summary}
            <ul className="mt-1 text-bds-gray-60">{unmeasured.map((g) => <li key={g.id}>{g.label}</li>)}</ul>
          </details>
          <Link className="underline" href="/scaling/guardrails">Guardrails →</Link>
        </div>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <Table rows={[...breached, ...met]} />
      <details className="flex flex-col gap-2 text-[13px]">
        {summary}
        <div className="mt-2"><Table rows={unmeasured} /></div>
      </details>
      <Text variant="footnote" tone="muted">{usageAsOf(collectedAt)}; bench rows show their run. Breached SLOs are not attributed to saturation until triaged.</Text>
    </section>
  );
}
