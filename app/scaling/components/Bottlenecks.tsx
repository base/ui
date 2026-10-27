import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { BLOB_TARGET, daCapacity, fmt, type DaWorkload } from '../da/workloads';
import type { Proven } from '../proven/capacity';
import { EXECUTE_PAYLOAD_P99_MS, PROOF_LAG_P99_BLOCKS, REPLAY_BLOCKS_PER_SECOND } from './Guardrails';
import { Tag } from './Tag';

export type Bar = { id: string; label: string; value: number | null; text: string; tag?: DaWorkload['tag'] };

const x = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}×`;

// Validators and the proof node within budget at the proven rate have a limit of at least that rate;
// over budget, their limit is somewhere below it.
export function bottleneckBars(workloads: DaWorkload[], proven: Proven | null): Bar[] {
  const da = workloads.map((w): Bar => {
    const value = daCapacity(w, BLOB_TARGET).mgasPerSecond;
    return { id: `da-${w.payload}`, label: `DA · ${w.label}`, value, text: `${w.tag === 'estimated' ? '~' : ''}${fmt(value)}`, tag: w.tag };
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
        ? { id: 'validators', label: 'Validators', value: m, text: `≥ ${m} · ${x(replay.blocksPerSecond / REPLAY_BLOCKS_PER_SECOND)} replay headroom` }
        : { id: 'validators', label: 'Validators', value: null, text: `below budget at ${m}` },
    !proofs
      ? { id: 'proof-node', label: 'Proof node', value: null, text: 'pending' }
      : { id: 'proof-node', label: 'Proof node', value: proofOk ? m : null, text: `${proofOk ? `≥ ${m}` : `over budget at ${m}`} · lag p99 ${proofs.headLagBlocks.p99} blocks` },
  ];
}

export function bindingBar(bars: Bar[]): Bar | null {
  return bars.reduce<Bar | null>((low, b) => (b.value !== null && (low === null || b.value < low.value!) ? b : low), null);
}

type Line = { value: number | null; label: string; className: string };

export function Bottlenecks({ bars, max, p50, limit }: { bars: Bar[]; max: number; p50: number | null; limit: number | null }) {
  const binding = bindingBar(bars);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const lines: Line[] = [
    { value: p50, label: `today p50 ${p50}`, className: 'border-bds-gray-100 dark:border-white' },
    { value: limit, label: `gas limit ${limit}`, className: 'border-bds-orange-60 text-bds-orange-60' },
  ];
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">What breaks first? <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <ul aria-label="Ceiling by subsystem" className="flex flex-col gap-2 text-[13px]">
        {bars.map((b) => (
          <li key={b.id} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[11rem_1fr_15rem]">
            <span>{b.label}</span>
            <div className="relative h-[18px]">
              {b.value === null ? null : (
                <div className={cn('absolute inset-y-0 left-0', b === binding ? 'bg-bds-red-60 opacity-85' : 'bg-base-blue opacity-55')} style={{ width: pct(b.value) }} />
              )}
              {lines.map((l) => (l.value === null ? null : <div key={l.label} className={cn('absolute -inset-y-1 border-l border-dashed', l.className)} style={{ left: pct(l.value) }} />))}
            </div>
            <span className="flex items-center gap-1.5 text-bds-gray-60">
              {b.text}
              {b.tag ? <Tag tag={b.tag} /> : null}
              {b === binding ? <span className="text-bds-red-60">· binding</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="relative h-4 text-[11px] sm:ml-[11.75rem] sm:mr-[15.75rem]">
        {lines.map((l) => (l.value === null ? null : <span key={l.label} className={cn('absolute whitespace-nowrap', l.className)} style={{ left: pct(l.value) }}>{l.label}</span>))}
      </div>
      <Text variant="label.regular" tone="muted">Same scale as the ladder. State joins once a runway is chosen.</Text>
    </section>
  );
}
