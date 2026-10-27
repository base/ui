'use client';

import Link from 'next/link';

import { cn } from '../../components/ui/cn';
import { Card } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import type { Run } from '../proven/capacity';
import type { Guardrail } from '../snapshot.mjs';
import { Info } from './Info';
import { useProvenCapacity } from './ProvenCapacity';
import { Tag } from './Tag';

const TH = 'px-4 py-2 text-left text-[12px] font-[500] text-bds-gray-60';
const TD = 'px-4 py-3 align-top';
const DOT: Record<Guardrail['status'], string> = { ok: 'bg-bds-green-50', breached: 'bg-bds-red-50', unknown: 'bg-bds-gray-30', 'not-monitored': 'bg-bds-gray-30' };
const STATUS: Record<Guardrail['status'], string> = { ok: 'OK', breached: 'Breached', unknown: 'Unknown', 'not-monitored': 'Not monitored' };
const rank = (g: Guardrail) => (g.status === 'not-monitored' ? 2 : g.value === null ? 1 : 0);

const fmt = (n: number, unit: string) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`.trim();

const judge = (g: Omit<Guardrail, 'status'>): Guardrail => ({
  ...g,
  status: g.value === null || g.threshold === null ? 'unknown' : (g.comparator === '<=' ? g.value <= g.threshold : g.value >= g.threshold) ? 'ok' : 'breached',
});

// Production validators may trail the tip by at most 3 blocks. `run` is the qualifying mainnet-mix
// bench run: undefined without a bench host, null when none is loaded.
export function scorecardGuardrails(snapshot: Guardrail[], run: Run | null | undefined): Guardrail[] {
  const keepUp = (g?: Guardrail) => judge({
    id: 'validator-keep-up', label: 'Validator keep-up', value: g?.value ?? null, unit: 'blocks', threshold: 3, comparator: '<=',
    thresholdTag: 'set', owner: g?.owner ?? null, asOf: g?.asOf ?? null,
    help: 'How far production validators trail the tip, from the snapshot. They must stay within 3 blocks.',
  });
  const rows = snapshot.some((g) => g.id === 'validator-keep-up')
    ? snapshot.map((g) => (g.id === 'validator-keep-up' ? keepUp(g) : g))
    : [...snapshot, keepUp()];
  if (run === undefined) return rows;
  const source = run ? ` From bench run ${run.outputDir}.` : ' No qualifying mainnet-mix bench run is loaded.';
  const bench = { comparator: '<=' as const, threshold: null, thresholdTag: 'unset' as const, owner: null, asOf: run ? new Date(run.createdAt).toISOString() : null };
  return [
    ...rows,
    judge({
      ...bench, id: 'proof-node-head-lag', label: 'Proof-node head lag p99', value: run?.proofNode?.proofs?.headLagBlocks.p99 ?? null, unit: 'blocks',
      help: `How far proof history trails the inserted head while the proof node replays the bench blocks.${source} Threshold pending.`,
    }),
    judge({
      ...bench, id: 'proof-node-execute-payload', label: 'debug_executePayload p99', value: run?.proofNode?.proofs?.methods.debug_executePayload?.latency.p99Ms ?? null, unit: 'ms',
      help: `Latency of the witness call the prover makes for each block, on the proof node.${source} Threshold pending.`,
    }),
    judge({
      ...bench, id: 'validator-replay-headroom', label: 'Validator replay headroom', value: run?.replay?.blocksPerSecond ?? null, unit: 'blocks/s',
      comparator: '>=', threshold: 5, thresholdTag: 'set',
      help: `Blocks per second a validator replays the bench blocks at. Keeping up needs 5, one block per 200 ms.${source}`,
    }),
  ];
}

export function Guardrails({ guardrails, detailed = false, benchUrl }: { guardrails: Guardrail[]; detailed?: boolean; benchUrl?: string }) {
  const bench = useProvenCapacity(benchUrl);
  const run = benchUrl ? (bench.error ? null : bench.data?.current.mix?.run ?? null) : undefined;
  return (
    <section className="flex flex-col gap-3">
      {detailed ? null : <Text as="h2" variant="headline"><Link className="underline" href="/scaling/guardrails">Guardrails →</Link></Text>}
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
            {scorecardGuardrails(guardrails, run).toSorted((a, b) => rank(a) - rank(b)).map((g) => (
              <tr key={g.id} className={cn('border-b border-bds-gray-10 last:border-0 dark:border-white/10', g.status === 'not-monitored' && 'text-bds-gray-60')}>
                <td className={TD}>
                  {detailed ? <>{g.label}<p className="text-bds-gray-60">{g.help}</p></> : (
                    <span className="flex items-center gap-1">{g.label} <Info label={`About ${g.label}`}>{g.help}</Info></span>
                  )}
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
      <Text variant="footnote" tone="muted">Breached SLOs are not attributed to saturation until triaged.</Text>
    </section>
  );
}
