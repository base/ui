import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

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

type Props = Pick<Snapshot, 'ladder' | 'usage'> & { bench: BenchState; proven: ProvenMark; limits: Limit[] };

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

// "≥ 21×" when proven is the top rate tested, a floor.
export const headroomLabel = (proven: NonNullable<ProvenMark>, today: number) => `${proven.atLeast ? '≥ ' : ''}${times(proven.value / today)}`;

export type Placement = { side: 'center' | 'left' | 'right'; x: number };

// Centers a label on x, or pins it to the nearer edge when centering would overflow. `estimate` is an
// approximate label width; a centered label renders with translateX(-50%), so it stays exact.
export function place(x: number, estimate: number, width: number): Placement {
  if (x - estimate / 2 < 0) return { side: 'left', x: 0 };
  if (x + estimate / 2 > width) return { side: 'right', x: width };
  return { side: 'center', x };
}

const placed = (p: Placement): CSSProperties =>
  p.side === 'left' ? { left: 0 } : p.side === 'right' ? { right: 0 } : { left: p.x, transform: 'translateX(-50%)' };

function Capacity({ ladder, usage, proven }: Pick<Props, 'ladder' | 'usage' | 'proven'>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(240);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const today = ladder.observed.p50.value;
  const tps = usage?.transactionsPerSecond;
  const span = proven && today !== null && today > 0 ? proven : null;
  const todayX = span ? Math.min(width, (today! / span.value) * width) : 0;
  const headroom = span ? headroomLabel(span, today!) : '';
  const todayText = `today ${today === null ? '' : n(today)}${tps ? ` · ${fmt(tps.value)} tx/s` : ''}`;
  return (
    <div ref={ref} className={cn(SLOTS, 'border-transparent px-0')}>
      <span data-slot="label" className={LABEL}>
        Proven capacity
        <Info label="About proven capacity">Execution, validators and proof node all pass at this rate on the mainnet snapshot. Workload tiles count successful transactions per second.</Info>
      </span>
      <span data-slot="value" className={cn(VALUE, 'text-[40px] font-[650]')}>
        {proven ? `${proven.atLeast ? '≥ ' : ''}${n(proven.value)}` : '—'}
        <span className="ml-1.5 text-[14px] font-[500] text-bds-gray-60">Mgas/s</span>
      </span>
      {span ? (
        <div role="group" aria-label="Today against proven capacity" className="relative h-[52px]">
          <span
            data-span="headroom"
            className="absolute top-0 flex items-center gap-1 whitespace-nowrap text-[18px] font-[700] leading-[22px] text-base-blue"
            style={placed(place((todayX + width) / 2, headroom.length * 11 + 20, width))}
          >
            {headroom}
            <Info label="About headroom">Proven capacity ÷ today&apos;s median gas rate. What breaks first lists the limits that apply before proven capacity.</Info>
          </span>
          <div className="absolute inset-x-0 top-[27px] h-0.5 rounded bg-bds-gray-10 dark:bg-white/10" />
          <div data-span="gap" className="absolute right-0 top-[25px] h-1.5 rounded bg-base-blue opacity-25" style={{ left: todayX }} />
          <span data-span="today" className="absolute top-[24px] h-2 w-2 -translate-x-1/2 rounded-full bg-bds-blue-90 dark:bg-white" style={{ left: todayX }} />
          <span data-span="proven" className="absolute right-0 top-[24px] h-2 w-2 rounded-full bg-base-blue" />
          <span data-span-label="today" className="absolute top-[34px] flex items-center gap-1 whitespace-nowrap text-[12px] leading-4" style={placed(place(todayX, todayText.length * 6 + 16, width))}>
            <b className="text-bds-blue-90 dark:text-white">today {n(today!)}</b>
            {tps ? <span className="text-bds-gray-60">· {fmt(tps.value)} tx/s</span> : null}
            {tps ? <Info label="About transactions per second">{tps.help}</Info> : null}
          </span>
          <span data-span-label="proven" className="absolute right-0 top-[34px] whitespace-nowrap text-[12px] leading-4 text-bds-gray-60">
            proven {span.atLeast ? '≥ ' : ''}{n(span.value)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

type Cap = 'DA' | 'gas limit' | 'execution';
type Translation = {
  label: ReactNode;
  gasPerTx: number | null;
  proven: { mgas: number; atLeast: boolean } | null;
  da: number;
  reverted?: number;
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
  return (
    <div className={cn(SLOTS, 'rounded-lg border-bds-gray-10 px-3.5 dark:border-white/10')}>
      <span data-slot="label" className={LABEL}>{r.label}</span>
      <span data-slot="value" className={cn(VALUE, 'text-[26px] font-[600]', r.proven && r.gasPerTx !== null ? 'text-base-blue' : 'text-bds-gray-60')}>
        {!r.proven ? 'pending' : r.gasPerTx === null ? '—' : <>{r.proven.atLeast ? '≥ ' : ''}{compact(tx(r.proven.mgas))}/s</>}
      </span>
      <span className={cn('flex h-[18px] items-center gap-1 whitespace-nowrap text-[12px] leading-[18px]', s && r.gasPerTx !== null ? CAP_TONE[s.cap] : 'text-bds-gray-60')}>
        sustainable today {!s ? 'pending' : r.gasPerTx === null ? '—' : `${fmt(tx(s.mgas))}/s`}
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
      gasPerTx,
      proven: proven && { mgas: proven.value, atLeast: proven.atLeast },
      da: daOf('mix'),
    },
  ];
}

export function Headline({ ladder, usage, bench, proven, limits }: Props) {
  const note = benchNote(bench, proven, ladder.qualified);
  const rows = translations({ ladder, usage, bench, proven, limits });
  return (
    <section aria-label="Proven capacity" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3.5 min-[760px]:grid-cols-3 min-[1100px]:grid-cols-[minmax(220px,1.1fr)_repeat(3,minmax(0,1fr))]">
        <div className="min-[760px]:col-span-3 min-[1100px]:col-span-1"><Capacity ladder={ladder} usage={usage} proven={proven} /></div>
        {rows.map((row, i) => <Tile key={i} row={row} gasLimit={ladder.configuredLimit.value} />)}
      </div>
      {note ? <Text variant="label.regular" tone="muted">{note}</Text> : null}
    </section>
  );
}
