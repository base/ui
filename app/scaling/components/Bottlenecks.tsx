import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { BLOB_TARGET, daCapacity, fmt, type DaWorkload } from '../da/workloads';
import { runHref, type PipelineStep, type Proven } from '../proven/capacity';
import { EXECUTE_PAYLOAD_P99_MS, PROOF_LAG_P99_BLOCKS, REPLAY_BLOCKS_PER_SECOND } from './Guardrails';
import { day } from './ProvenCapacity';
import { Tag } from './Tag';

export type Bar = { id: string; label: string; value: number | null; text: string; tag?: DaWorkload['tag']; perSecond?: number };
// One row of the ranked table: a bar, or execution, validators and proof node merged when they share a ceiling.
export type Limit = { id: string; label: string; value: number | null; ceiling: string; evidence: string; tag?: DaWorkload['tag']; perSecond?: number; workload?: DaWorkload };

export const times = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}×`;
const TH = 'px-3 py-2 text-left text-[11px] font-[600] uppercase tracking-wide text-bds-gray-60';
const TD = 'px-3 py-2.5 align-middle';
const STEP_DOT: Record<PipelineStep['status'], string> = { passed: 'bg-bds-green-50', failed: 'bg-bds-red-50', skipped: 'bg-bds-gray-30', 'not-implemented': 'bg-bds-gray-30' };

// Validators and the proof node within budget at the proven rate have a limit of at least that rate;
// over budget, their limit is somewhere below it.
export function bottleneckBars(workloads: DaWorkload[], proven: Proven | null): Bar[] {
  const da = workloads.map((w): Bar => {
    const { mgasPerSecond: value, txPerSecond } = daCapacity(w, BLOB_TARGET);
    return { id: `da-${w.payload}`, label: `DA · ${w.label}`, value, text: `${w.tag === 'estimated' ? '~' : ''}${fmt(value)}`, tag: w.tag, perSecond: txPerSecond };
  });
  const run = proven?.run;
  const m = proven?.mgas ?? null;
  const proofs = run?.proofNode?.proofs;
  const replay = run?.replay;
  const executeP99 = proofs?.methods.debug_executePayload?.latency.p99Ms;
  const proofOk = proofs && executeP99 !== undefined && proofs.headLagBlocks.p99 <= PROOF_LAG_P99_BLOCKS && executeP99 <= EXECUTE_PAYLOAD_P99_MS;
  return [
    ...da,
    { id: 'execution', label: 'Execution (sequencer)', value: m, text: !proven ? 'no proven run' : proven.atTop ? `≥ ${m} · top rate tested` : `${m}` },
    !replay
      ? { id: 'validators', label: 'Validators', value: null, text: 'pending' }
      : replay.match && replay.blocksPerSecond >= REPLAY_BLOCKS_PER_SECOND
        ? { id: 'validators', label: 'Validators', value: m, text: `≥ ${m} · ${times(replay.blocksPerSecond / REPLAY_BLOCKS_PER_SECOND)} replay headroom` }
        : { id: 'validators', label: 'Validators', value: null, text: `below budget at ${m}` },
    !proofs
      ? { id: 'proof-node', label: 'Proof node', value: null, text: 'pending' }
      : { id: 'proof-node', label: 'Proof node', value: proofOk ? m : null, text: `${proofOk ? `≥ ${m}` : `over budget at ${m}`} · lag p99 ${proofs.headLagBlocks.p99} blocks` },
  ];
}

function daEvidence(w: DaWorkload): string {
  if (w.tag === 'estimated') return 'est. · run pending';
  if (w.bench && w.source?.url === runHref(w.bench.run)) return `measured · ${w.bench.da.result.blobs_per_l1_slot.toFixed(1)} blobs/slot at ${w.bench.run.mgas}`;
  return `measured · ${w.source?.label ?? 'source pending'}`;
}

// Lowest ceiling first; limits without a ceiling keep their order after the ranked ones.
export function rankLimits(bars: Bar[], workloads: DaWorkload[], proven: Proven | null): Limit[] {
  const da = bars.filter((b) => b.id.startsWith('da-')).map((b): Limit => {
    const w = workloads.find((x) => `da-${x.payload}` === b.id)!;
    return { id: b.id, label: b.label, value: b.value, ceiling: `${b.text} ≈ ${fmt(b.perSecond!)}/s`, evidence: daEvidence(w), tag: b.tag, perSecond: b.perSecond, workload: w };
  });
  const core = bars.filter((b) => !b.id.startsWith('da-'));
  const m = proven?.mgas ?? null;
  const atLeast = (atTop: boolean) => (atTop ? `≥ ${m}` : `${m}`);
  const merged: Limit[] = m !== null && core.every((b) => b.value === m)
    ? [{ id: 'core', label: 'Execution, validators, proof node', value: m, ceiling: atLeast(proven!.atTop), evidence: `all pass at ${m}` }]
    : core.map((b) => ({
      id: b.id,
      label: b.label,
      value: b.value,
      ceiling: b.value === null ? '—' : atLeast(b.id !== 'execution' || proven!.atTop),
      evidence: b.value === null ? b.text : b.id === 'execution' && !proven!.atTop ? 'the next rate tested did not pass' : b.text.split(' · ').slice(1).join(' · '),
    }));
  return [...da, ...merged].toSorted((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
}

function Evidence({ proven }: { proven: Proven }) {
  const { run } = proven;
  return (
    <div className="flex flex-col gap-1">
      <Text variant="label.regular" tone="muted">
        Proven by <a className="underline" href={runHref(run)}>{run.outputDir}</a>: {run.mgas} Mgas/s run delivered {(run.gps / 1e6).toFixed(1)} Mgas/s · commit{' '}
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

export function Bottlenecks({ limits, max, gasLimit, proven }: { limits: Limit[]; max: number; gasLimit: number | null; proven: Proven | null }) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const ranked = limits.filter((l) => l.value !== null).length;
  const fixed = [
    { label: 'State (full node)', evidence: 'runway pending' },
    { label: 'TEE proving, RPC under sync', evidence: 'not measured yet' },
  ];
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">What breaks first <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <Card className="overflow-x-auto bg-background dark:bg-white/5">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-bds-gray-10 dark:border-white/10">
              <th className={TH}>#</th><th className={TH}>Limit</th><th className={cn(TH, 'text-right')}>Ceiling</th><th className={cn(TH, 'w-[28%]')} /><th className={TH}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {limits.map((l, i) => {
              const next = i === 0 && l.value !== null;
              return (
                <tr key={l.id} className="border-b border-bds-gray-10 dark:border-white/10">
                  <td className={cn(TD, 'text-bds-gray-60')}>{i < ranked ? i + 1 : '—'}</td>
                  <td className={cn(TD, 'whitespace-nowrap')}>
                    {l.label}
                    {next ? <span className="ml-1.5 rounded bg-bds-red-60 px-1.5 py-px text-[11px] font-[600] text-white">next</span> : null}
                  </td>
                  <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums', next && 'text-bds-red-60')}>
                    {l.ceiling}{l.tag ? <> <Tag tag={l.tag} /></> : null}
                  </td>
                  <td className={TD}>
                    <div className="relative h-2.5 min-w-[90px] rounded bg-bds-gray-10 dark:bg-white/10">
                      {l.value === null ? null : <div className={cn('absolute inset-y-0 left-0 rounded', next ? 'bg-bds-red-60' : 'bg-bds-blue-30')} style={{ width: pct(l.value) }} />}
                      {gasLimit === null ? null : <span className="absolute -inset-y-1 border-l-[1.5px] border-dashed border-bds-orange-60" style={{ left: pct(gasLimit) }} />}
                    </div>
                  </td>
                  <td className={cn(TD, 'text-[12px]', l.tag === 'estimated' || l.value === null ? 'text-bds-gray-60' : '')}>{l.evidence}</td>
                </tr>
              );
            })}
            {fixed.map((f) => (
              <tr key={f.label} className="border-b border-bds-gray-10 text-bds-gray-60 last:border-0 dark:border-white/10">
                <td className={TD}>—</td><td className={TD}>{f.label}</td><td className={cn(TD, 'text-right')}>—</td><td className={TD} /><td className={cn(TD, 'text-[12px]')}>{f.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {proven ? <Evidence proven={proven} /> : null}
    </section>
  );
}
