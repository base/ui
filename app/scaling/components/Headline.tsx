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

export type FirstLimit = { mgas: number; bound: '≤' | '≥' | ''; name: string; reason: string };

// The lowest limit that applies to today's traffic mix. Payment- and swap-specific DA rows do not;
// on ties the earlier entry wins, so an exact limit beats a bound.
export function firstLimit(limits: Limit[], gasLimit: number | null, proven: ProvenMark): FirstLimit | null {
  const value = (id: string) => limits.find((l) => l.id === id)?.value ?? null;
  const candidates: (FirstLimit | null)[] = [
    value('da-mix') === null ? null : { mgas: value('da-mix')!, bound: '', name: 'mix DA', reason: '' },
    gasLimit === null ? null : { mgas: gasLimit, bound: '', name: 'gas limit', reason: '' },
    value('disk-archive') === null ? null : { mgas: value('disk-archive')!, bound: '≤', name: 'archive disk', reason: '≤ because the archive disk ceiling is an upper bound.' },
    value('disk-full') === null ? null : { mgas: value('disk-full')!, bound: '≤', name: 'full-node disk', reason: '≤ because the full-node disk ceiling is an upper bound.' },
    !proven ? null : {
      mgas: proven.value,
      bound: proven.atLeast ? '≥' : '',
      name: 'proven',
      reason: proven.atLeast ? `≥ because ${n(proven.value)} Mgas/s is the highest rate tested, a floor.` : '',
    },
  ];
  return candidates.reduce<FirstLimit | null>((low, c) => (c && (!low || c.mgas < low.mgas) ? c : low), null);
}

export const headroomLabel = (limit: FirstLimit, today: number) => `${limit.bound ? `${limit.bound} ` : ''}${times(limit.mgas / today)}`;

function Capacity({ ladder, usage, proven, limit }: Pick<Props, 'ladder' | 'usage' | 'proven'> & { limit: FirstLimit | null }) {
  const today = ladder.observed.p50.value;
  const tps = usage?.transactionsPerSecond;
  const end = Math.max(proven?.value ?? 0, limit?.mgas ?? 0, today ?? 0);
  const pct = (v: number) => (end > 0 ? Math.min(100, Math.max(0, (v / end) * 100)) : 0);
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
      {today !== null && limit ? (
        <div aria-label="Today against the first limit" role="group" className="flex flex-col gap-1">
          <div className="relative mt-5 h-2">
            <div className="absolute inset-x-0 top-[3px] h-0.5 rounded bg-bds-gray-10 dark:bg-white/10" />
            <span
              data-span="headroom"
              className="absolute -top-5 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[15px] font-[650] leading-4 text-base-blue"
              style={{ left: `${(pct(today) + pct(limit.mgas)) / 2}%` }}
            >
              {headroomLabel(limit, today)}
              <Info label="About headroom">First limit for today&apos;s traffic mix ÷ today&apos;s median gas rate. {limit.reason}</Info>
            </span>
            <span data-span="today" className="absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-bds-blue-90 dark:bg-white" style={{ left: `${pct(today)}%` }} />
            <span data-span="limit" className="absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-bds-red-60" style={{ left: `${pct(limit.mgas)}%` }} />
            <span data-span="proven" className="absolute -top-0.5 right-0 h-3 w-px bg-bds-gray-40" />
          </div>
          <div className="flex justify-between gap-2 text-[12px]">
            <span className="whitespace-nowrap">
              <b className="text-bds-blue-90 dark:text-white">today {n(today)}</b>
              {tps ? <span className="text-bds-gray-60"> · {fmt(tps.value)} tx/s</span> : null}
              {tps ? <> <Info label="About transactions per second">{tps.help}</Info></> : null}
            </span>
            <span className="whitespace-nowrap text-bds-red-60">{limit.name} {limit.bound ? `${limit.bound} ` : ''}{fmt(limit.mgas)}</span>
          </div>
        </div>
      ) : null}
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

// The traffic tile repeats the headroom multiple only when its sustainable rate is the same first limit.
function Tile({ row: r, gasLimit, headroomMgas }: { row: Translation; gasLimit: number | null; headroomMgas: number | null }) {
  const s = r.proven && sustainable(r.proven.mgas, r.da, gasLimit);
  const tx = (mgas: number) => (mgas * 1e6) / r.gasPerTx!;
  const vs = (v: number) => (r.vsToday && r.today && s?.mgas === headroomMgas ? <span className="text-bds-gray-60"> ({times(v / r.today)})</span> : null);
  return (
    <div className={cn(SLOTS, 'rounded-lg border-bds-gray-10 px-3.5 dark:border-white/10')}>
      <span data-slot="label" className={LABEL}>{r.label}</span>
      <span data-slot="value" className={cn(VALUE, 'text-[26px] font-[600]', r.proven && r.gasPerTx !== null ? 'text-base-blue' : 'text-bds-gray-60')}>
        {!r.proven ? 'pending' : r.gasPerTx === null ? '—' : <>{r.proven.atLeast ? '≥ ' : ''}{compact(tx(r.proven.mgas))}/s</>}
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
  const sub = limit.id.startsWith('disk-')
    ? limit.evidence
    : w
    ? [`≈ ${fmt(limit.perSecond!)} ${TRAFFIC[w.payload]}/s`, bench && `${bench.da.result.blobs_per_l1_slot.toFixed(1)} blobs/slot vs ${bench.da.target ?? BLOB_TARGET} at ${bench.run.mgas}`].filter(Boolean).join(' · ')
    : proven?.atLeast ? 'no limit found up to the top rate tested' : 'the next rate tested did not pass';
  return (
    <div className="flex flex-col gap-0.5 rounded-r-md border-l-[3px] border-bds-red-60 bg-bds-red-0 px-3.5 py-2.5 dark:bg-white/5">
      <span className="text-[11px] font-[600] uppercase tracking-wide text-bds-red-60">Next bottleneck to solve</span>
      <span className="text-[17px] font-[600]">{limit.label} {limit.value === 0 ? 'is over budget' : `at ${limit.ceiling.split(' ≈ ')[0]} Mgas/s`}</span>
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

// Disk ceilings come from one workload's storage run, so they stay out of the tiles; a note flags one
// that is lower than what a tile calls sustainable.
function diskNote(rows: Translation[], limits: Limit[], gasLimit: number | null): string | null {
  const sustained = rows.flatMap((r) => (r.proven ? [sustainable(r.proven.mgas, r.da, gasLimit).mgas] : []));
  const disk = limits.filter((l) => l.id.startsWith('disk-') && l.value !== null).toSorted((a, b) => a.value! - b.value!)[0];
  if (!disk || !sustained.length || disk.value! >= Math.max(...sustained)) return null;
  const which = disk.id === 'disk-archive' ? 'Archive' : 'Full-node';
  return disk.value === 0 ? `${which} disk is over budget` : `${which} disk may cap lower (≤ ${fmt(disk.value!)} Mgas/s at ${disk.runwayYears}-year runway)`;
}

export function Headline({ ladder, usage, bench, proven, next, limits }: Props) {
  const note = benchNote(bench, proven, ladder.qualified);
  const rows = translations({ ladder, usage, bench, proven, limits });
  const disk = diskNote(rows, limits, ladder.configuredLimit.value);
  const limit = firstLimit(limits, ladder.configuredLimit.value, proven);
  return (
    <section aria-label="Proven capacity and next bottleneck" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3.5 min-[760px]:grid-cols-3 min-[1100px]:grid-cols-[minmax(220px,1.1fr)_repeat(3,minmax(0,1fr))]">
        <div className="min-[760px]:col-span-3 min-[1100px]:col-span-1"><Capacity ladder={ladder} usage={usage} proven={proven} limit={limit} /></div>
        {rows.map((row, i) => <Tile key={i} row={row} gasLimit={ladder.configuredLimit.value} headroomMgas={limit?.mgas ?? null} />)}
      </div>
      {disk ? <Text variant="label.regular" tone="muted">{disk}</Text> : null}
      {next ? <Next limit={next} proven={proven} /> : null}
      {bench.data ? <LastChange history={bench.data.history} /> : null}
      {note ? <Text variant="label.regular" tone="muted">{note}</Text> : null}
    </section>
  );
}
