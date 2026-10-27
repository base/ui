import type { ReactNode } from 'react';

import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { BLOB_TARGET, fmt } from '../da/workloads';
import { successfulTps, type ProvenCapacity, type Workload } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { times, type Limit } from './Bottlenecks';
import { Info } from './Info';
import type { ProvenMark } from './Ladder';
import { day } from './ProvenCapacity';

export type BenchState = { configured: boolean; data?: ProvenCapacity; error?: unknown };

const TRAFFIC: Record<Workload, string> = { payment: 'payments', swap: 'swaps', mix: 'tx' };
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

type Props = Pick<Snapshot, 'ladder' | 'usage'> & { bench: BenchState; proven: ProvenMark; next: Limit | null; limits: Limit[] };

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
    p50.value !== null && `today ${n(p50.value)}${tps ? ` (${fmt(tps.value)} tx/s)` : ''}`,
    p99.value !== null && `p99 ${n(p99.value)}`,
    headroom !== null && times(headroom),
  ].filter(Boolean);
  return (
    <div className={cn(SLOTS, 'border-transparent px-0')}>
      <span data-slot="label" className={LABEL}>
        Proven capacity
        <Info label="About proven capacity">Execution, validators and proof node all pass at this rate on the mainnet snapshot. Workload tiles count successful transactions per second.</Info>
      </span>
      <span data-slot="value" className={cn(VALUE, 'text-[40px] font-[650]')}>
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

type Cap = 'DA' | 'gas limit' | 'execution';
type Translation = {
  label: ReactNode;
  today: number | null;
  gasPerTx: number | null;
  proven: { mgas: number; atLeast: boolean } | null;
  da: number;
  reverted?: number;
  vsToday?: boolean;
};

// The lowest of the three ceilings; ties go to DA, then the gas limit.
export function sustainable(proven: number, da: number, gasLimit: number | null): { mgas: number; cap: Cap } {
  const caps: [Cap, number][] = [['DA', da], ['gas limit', gasLimit ?? Infinity], ['execution', proven]];
  const [cap, mgas] = caps.reduce((low, c) => (c[1] < low[1] ? c : low));
  return { mgas, cap };
}

// The headline column and the tiles share these slots so their label and value rows line up.
const SLOTS = 'flex flex-col gap-1.5 border py-3';
const LABEL = 'flex h-4 items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] font-[600] uppercase leading-4 tracking-wide text-bds-gray-60';
const VALUE = 'whitespace-nowrap leading-[44px] tabular-nums';
const CAP_TONE: Record<Cap, string> = { DA: 'text-bds-red-60', 'gas limit': 'text-bds-orange-60', execution: '' };
const compact = (v: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v).toLowerCase();

function Tile({ row: r, gasLimit }: { row: Translation; gasLimit: number | null }) {
  const s = r.proven && sustainable(r.proven.mgas, r.da, gasLimit);
  const tx = (mgas: number) => (mgas * 1e6) / r.gasPerTx!;
  const vs = (v: number) => (r.vsToday && r.today ? <span className="text-bds-gray-60"> ({times(v / r.today)})</span> : null);
  return (
    <div className={cn(SLOTS, 'rounded-lg border-bds-gray-10 px-3.5 dark:border-white/10')}>
      <span data-slot="label" className={LABEL}>{r.label}</span>
      <span data-slot="value" className={cn(VALUE, 'text-[26px] font-[600]', r.proven && r.gasPerTx !== null ? 'text-base-blue' : 'text-bds-gray-60')}>
        {!r.proven ? 'pending' : r.gasPerTx === null ? '—' : <>{r.proven.atLeast ? '≥ ' : ''}{compact(tx(r.proven.mgas))}/s<span className="text-[14px] font-[500]">{vs(tx(r.proven.mgas))}</span></>}
      </span>
      <span className={cn('flex h-[18px] items-center gap-1 whitespace-nowrap text-[12px] leading-[18px]', s && r.gasPerTx !== null ? CAP_TONE[s.cap] : 'text-bds-gray-60')}>
        sustainable today {!s ? 'pending' : r.gasPerTx === null ? '—' : <>{fmt(tx(s.mgas))}/s{vs(tx(s.mgas))}</>}
        <Info label="About sustainable today">
          Highest rate we can run continuously now: below the L1 blob target and within the current gas limit{gasLimit === null ? '' : ` (${n(gasLimit)} Mgas/s)`}. Capped by DA or the gas limit, not execution.
        </Info>
      </span>
      <span className="h-[18px] text-[12px] leading-[18px] text-bds-gray-60">{s ? `capped by ${s.cap}` : ''}</span>
      {/* Reserved on every tile so a note on one does not shift the others. */}
      <span className="flex min-h-[18px] items-center gap-1 text-[12px] leading-[18px] text-bds-gray-60">
        {r.reverted !== undefined && r.reverted > 0.01 ? (
          <>
            {Math.round(r.reverted * 100)}% reverted
            <Info label="About reverted transactions">Reverted transactions still use gas and count toward Mgas/s; tx/s counts successful ones only.</Info>
          </>
        ) : null}
      </span>
    </div>
  );
}

// Bench workloads convert with their proven run's gas per successful transaction; today's traffic mix
// with mainnet's own gas per transaction, since the bench mix only approximates mainnet.
function translations({ ladder, usage, bench, proven, limits }: Pick<Props, 'ladder' | 'usage' | 'bench' | 'proven' | 'limits'>): Translation[] {
  const daOf = (w: Workload) => limits.find((l) => l.id === `da-${w}`)!.value!;
  const benchRow = (w: Workload, label: string): Translation => {
    const p = bench.data?.current[w] ?? null;
    return {
      label,
      today: null,
      gasPerTx: p ? p.run.gps / successfulTps(p.run) : null,
      proven: p && { mgas: p.mgas, atLeast: p.atTop },
      da: daOf(w),
      reverted: p?.run.reverted,
    };
  };
  const p50 = ladder.observed.p50.value;
  const tps = usage?.transactionsPerSecond.value ?? null;
  const gasPerTx = p50 !== null && tps ? (p50 * 1e6) / tps : null;
  const mixHelp = gasPerTx !== null
    ? `At today's mainnet average of ~${Math.round(gasPerTx / 1e3)}k gas per transaction (${n(p50!)} Mgas/s ÷ ${fmt(tps!)} tx/s), not the bench mix.`
    : `The snapshot has no transactions per second, so this row stays in gas: today ${p50 === null ? 'not measured' : `${n(p50)} Mgas/s`}.`;
  return [
    benchRow('payment', 'Payments (B20)'),
    benchRow('swap', 'Swaps (Uniswap v3)'),
    {
      label: <span className="inline-flex items-center gap-1">Today&apos;s traffic mix <Info label="About today's traffic mix">{mixHelp}</Info></span>,
      today: tps,
      gasPerTx,
      proven: proven && { mgas: proven.value, atLeast: proven.atLeast },
      da: daOf('mix'),
      vsToday: true,
    },
  ];
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

export function Headline({ ladder, usage, bench, proven, next, limits }: Props) {
  const note = benchNote(bench, proven, ladder.qualified);
  return (
    <section aria-label="Proven capacity and next bottleneck" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3.5 min-[760px]:grid-cols-3 min-[1100px]:grid-cols-[minmax(220px,1.1fr)_repeat(3,minmax(0,1fr))]">
        <div className="min-[760px]:col-span-3 min-[1100px]:col-span-1"><Capacity ladder={ladder} usage={usage} proven={proven} /></div>
        {translations({ ladder, usage, bench, proven, limits }).map((row, i) => <Tile key={i} row={row} gasLimit={ladder.configuredLimit.value} />)}
      </div>
      {next ? <Next limit={next} proven={proven} /> : null}
      {bench.data ? <LastChange history={bench.data.history} /> : null}
      {note ? <Text variant="label.regular" tone="muted">{note}</Text> : null}
    </section>
  );
}
