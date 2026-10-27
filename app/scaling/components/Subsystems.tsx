import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { BLOB_TARGET } from '../da/workloads';
import { runHref, type PipelineStep, type Proven } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { KEEP_UP_BLOCKS, REPLAY_BLOCKS_PER_SECOND } from './Guardrails';
import { day } from './ProvenCapacity';
import { Tag } from './Tag';

type Tone = 'ok' | 'bad' | 'muted';
type Row = { name: string; href?: string; measured: ReactNode; budget: ReactNode; headroom: string; status: [string, Tone] };

const TH = 'px-4 py-2 text-left text-[12px] font-[500] text-bds-gray-60';
const TD = 'px-4 py-3 align-top';
const TONE: Record<Tone, string> = { ok: 'text-bds-green-60', bad: 'text-bds-red-60', muted: 'text-bds-gray-60' };
const STEP_DOT: Record<PipelineStep['status'], string> = { passed: 'bg-bds-green-50', failed: 'bg-bds-red-50', skipped: 'bg-bds-gray-30', 'not-implemented': 'bg-bds-gray-30' };
const SECONDS_PER_YEAR = 365.25 * 86_400;
const PENDING: [string, Tone] = ['pending', 'muted'];
const x = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)}×`;

function stepStatus(proven: Proven | null, name: string, passed: [string, Tone]): [string, Tone] {
  const status = proven?.run.steps.find((s) => s.name === name)?.status;
  return status === 'passed' ? passed : status === 'failed' ? ['fail', 'bad'] : status ? [status, 'muted'] : PENDING;
}

function rows(proven: Proven | null, { guardrails, ceilings }: Pick<Snapshot, 'guardrails' | 'ceilings'>): Row[] {
  const run = proven?.run;
  const { replay, da } = run ?? {};
  const proofs = run?.proofNode?.proofs;
  const executePayload = proofs?.methods.debug_executePayload;
  const keepUp = guardrails.find((g) => g.id === 'validator-keep-up')?.value ?? null;
  const target = da?.target ?? BLOB_TARGET;
  const input = (name: string) => ceilings.find((c) => c.area === 'state')?.inputs.find((i) => i.name === name);
  const maxSize = input('single_node_max');
  const bytesPerGas = input('state_bytes_per_gas')?.value;
  const tbPerYear = proven && typeof bytesPerGas === 'number' ? (bytesPerGas * proven.mgas * 1e6 * SECONDS_PER_YEAR) / 1e12 : null;
  return [
    {
      name: 'Sequencer', href: '/scaling/execution',
      measured: run ? `${(run.gps / 1e6).toFixed(1)} Mgas/s delivered` : 'pending',
      budget: '≥ 95% of target', headroom: '—',
      status: stepStatus(proven, 'sequencer', ['pass', 'ok']),
    },
    {
      name: 'Validator replay',
      measured: [
        replay && `${replay.blocksPerSecond.toFixed(1)} blocks/s, newPayload p99 ${replay.newPayload.p99Ms} ms`,
        keepUp !== null && `production lag ${keepUp} blocks`,
      ].filter(Boolean).join('; ') || 'pending',
      budget: `≥ ${REPLAY_BLOCKS_PER_SECOND} blocks/s; production lag ≤ ${KEEP_UP_BLOCKS} blocks`,
      headroom: replay ? x(replay.blocksPerSecond / REPLAY_BLOCKS_PER_SECOND) : '—',
      status: !replay ? PENDING : !replay.match ? ['mismatch', 'bad'] : replay.blocksPerSecond >= REPLAY_BLOCKS_PER_SECOND ? ['pass', 'ok'] : ['below budget', 'bad'],
    },
    {
      name: 'Proof node',
      measured: proofs ? [`lag p99 ${proofs.headLagBlocks.p99} blocks`, executePayload && `executePayload p99 ${executePayload.latency.p99Ms} ms`].filter(Boolean).join('; ') : 'pending',
      budget: <span className="text-bds-gray-60">pending</span>, headroom: '—',
      status: stepStatus(proven, 'proof_node', ['budget pending', 'muted']),
    },
    {
      name: 'DA (bench mix)', href: '/scaling/da',
      measured: da ? `${da.result.blobs_per_l1_slot.toFixed(1)} blobs per L1 slot` : 'pending',
      budget: `${target} blobs`,
      headroom: da ? x(target / da.result.blobs_per_l1_slot) : '—',
      status: !da ? PENDING : da.withinTarget === null ? ['not judged', 'muted'] : da.withinTarget ? ['within target', 'ok'] : ['over target', 'bad'],
    },
    {
      name: 'State (full node)', href: '/scaling/state',
      measured: tbPerYear === null ? 'pending' : <>~{tbPerYear.toFixed(1)} TB/yr at {proven!.mgas} <Tag tag="estimated" /></>,
      budget: maxSize?.value == null ? 'pending' : `${maxSize.value} ${maxSize.unit}`.trim(),
      headroom: tbPerYear && maxSize?.unit === 'TB' && typeof maxSize.value === 'number' ? `~${(maxSize.value / tbPerYear).toFixed(1)} yr` : '—',
      status: ['runway pending', 'muted'],
    },
  ];
}

function Evidence({ proven }: { proven: Proven }) {
  const { run } = proven;
  return (
    <div className="flex flex-col gap-1">
      <Text variant="label.regular" tone="muted">
        Qualified by <a className="underline" href={runHref(run)}>{run.outputDir}</a>: {run.mgas} Mgas/s run delivered {(run.gps / 1e6).toFixed(1)} Mgas/s · commit{' '}
        <a className="font-mono underline" href={`https://github.com/base/base/commit/${run.commit}`}>{run.commit.slice(0, 7)}</a> · {day(run.createdAt)}
      </Text>
      <ul aria-label="Pipeline steps" className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-bds-gray-60">
        {run.steps.map((s) => (
          <li key={s.name} className="flex items-center gap-1" title={s.reason ?? undefined}>
            <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', STEP_DOT[s.status])} />
            {s.name.replace('_', ' ')} {s.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Subsystems({ proven, guardrails, ceilings }: Pick<Snapshot, 'guardrails' | 'ceilings'> & { proven: Proven | null }) {
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Subsystem detail</Text>
      <Card className="overflow-x-auto bg-background dark:bg-white/5">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-bds-gray-10 dark:border-white/10">
              {['Subsystem', `Measured at ${proven ? `${proven.mgas} Mgas/s` : 'the proven rate'}`, 'Budget', 'Headroom', 'Status'].map((h) => <th key={h} className={TH}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows(proven, { guardrails, ceilings }).map((r) => (
              <tr key={r.name} className="border-b border-bds-gray-10 dark:border-white/10">
                <td className={cn(TD, 'whitespace-nowrap')}>{r.href ? <Link className="underline" href={r.href}>{r.name}</Link> : r.name}</td>
                <td className={TD}>{r.measured}</td>
                <td className={TD}>{r.budget}</td>
                <td className={cn(TD, 'whitespace-nowrap font-mono')}>{r.headroom}</td>
                <td className={cn(TD, 'whitespace-nowrap', TONE[r.status[1]])}>{r.status[0]}</td>
              </tr>
            ))}
            <tr className="text-bds-gray-60">
              <td className={TD}>TEE proving, RPC under sync</td>
              <td className={TD} colSpan={3}>not measured yet</td>
              <td className={TD}>—</td>
            </tr>
          </tbody>
        </table>
      </Card>
      {proven ? <Evidence proven={proven} /> : null}
    </section>
  );
}
