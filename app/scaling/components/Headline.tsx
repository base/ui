import type { ReactNode } from 'react';

import { Text } from '../../components/ui/Text';
import { BLOB_TARGET, fmt } from '../da/workloads';
import type { ProvenCapacity, Workload } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import type { Limit } from './Bottlenecks';
import { Info } from './Info';
import type { ProvenMark } from './Ladder';
import { day } from './ProvenCapacity';

export type BenchState = { configured: boolean; data?: ProvenCapacity; error?: unknown };

const TRAFFIC: Record<Workload, string> = { payment: 'payments', swap: 'swaps', mix: 'tx' };
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

type Props = Pick<Snapshot, 'ladder' | 'usage'> & { bench: BenchState; proven: ProvenMark; next: Limit | null };

// Only states other than a loaded bench result need a note.
function benchNote({ configured, data, error }: BenchState, proven: ProvenMark, qualified: Snapshot['ladder']['qualified']): ReactNode {
  if (!configured) {
    if (!proven) return null;
    return <>Proven capacity from the snapshot{qualified.evidence?.map((l) => <span key={l.url}> · <a className="underline" href={l.url}>{l.label}</a></span>)}</>;
  }
  if (error) return 'Could not load bench results. The bench host is reachable only on VPN and must allow this origin via CORS.';
  if (!data) return 'Loading bench results…';
  // A run whose files failed to load is skipped, so an older result at its rate may count instead.
  const partial = data.unknown.length ? `${data.unknown.length} run(s) could not be loaded, so this may be wrong.` : '';
  return data.current.mix ? partial || null : `No main run passed in the last 14 days. ${partial}`.trim();
}

function Capacity({ ladder, usage, proven }: Pick<Props, 'ladder' | 'usage' | 'proven'>) {
  const { p50, p99 } = ladder.observed;
  const tps = usage?.transactionsPerSecond;
  const headroom = proven && p50.value ? proven.value / p50.value : null;
  const caption = [
    p50.value !== null && `today ${n(p50.value)} median${tps ? ` (${fmt(tps.value)} tx/s)` : ''}`,
    p99.value !== null && `${n(p99.value)} p99`,
    headroom !== null && `${headroom < 10 ? headroom.toFixed(1) : Math.round(headroom)}×`,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-[600] uppercase tracking-wide text-bds-gray-60">Proven capacity</span>
      <span className="text-[40px] font-[650] leading-[1.05] tabular-nums">
        {proven ? `${proven.atLeast ? '≥ ' : ''}${n(proven.value)}` : '—'}
        <span className="ml-1.5 text-[14px] font-[500] text-bds-gray-60">Mgas/s</span>
      </span>
      <span className="flex flex-wrap items-center gap-1 text-[13px] text-bds-gray-60">
        {caption.join(' · ')}
        {tps ? <Info label="About transactions per second">{tps.help}</Info> : null}
      </span>
    </div>
  );
}

function Next({ limit, proven }: { limit: Limit; proven: ProvenMark }) {
  const w = limit.workload;
  const bench = w?.bench;
  const sub = w
    ? [`≈ ${fmt(limit.perSecond!)} ${TRAFFIC[w.payload]}/s`, bench && `${bench.da.result.blobs_per_l1_slot.toFixed(1)} blobs/slot vs ${bench.da.target ?? BLOB_TARGET} at ${bench.run.mgas}`].filter(Boolean).join(' · ')
    : proven?.atLeast ? 'no limit found up to the top rate tested' : 'the next rate tested did not pass';
  return (
    <div className="flex flex-col gap-0.5 rounded-r-md border-l-[3px] border-bds-red-60 bg-bds-red-0 px-3.5 py-2.5 dark:bg-white/5">
      <span className="text-[11px] font-[600] uppercase tracking-wide text-bds-red-60">Next bottleneck to solve</span>
      <span className="text-[17px] font-[600]">{limit.label} at {limit.ceiling.split(' ≈ ')[0]} Mgas/s</span>
      <span className="text-[12px] text-bds-gray-60">{sub}</span>
    </div>
  );
}

function LastChange({ history }: { history: ProvenCapacity['history'] }) {
  if (history.length < 2) return null;
  const [previous, last] = history.slice(-2);
  const down = last.mgas !== null && previous.mgas !== null && last.mgas < previous.mgas;
  return (
    <Text variant="label.regular" tone="muted">
      {down ? '↓' : '↑'} from {previous.mgas === null ? 'none' : `${previous.mgas} Mgas/s`} on {day(last.at)}
      {last.compareUrl ? <> · <a className="underline" href={last.compareUrl}>compare</a></> : null}
    </Text>
  );
}

export function Headline({ ladder, usage, bench, proven, next }: Props) {
  const note = benchNote(bench, proven, ladder.qualified);
  return (
    <section aria-label="Proven capacity and next bottleneck" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 items-end gap-5 md:grid-cols-2">
        <Capacity ladder={ladder} usage={usage} proven={proven} />
        {next ? <Next limit={next} proven={proven} /> : null}
      </div>
      {bench.data ? <LastChange history={bench.data.history} /> : null}
      {note ? <Text variant="label.regular" tone="muted">{note}</Text> : null}
    </section>
  );
}
