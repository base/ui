import type { ReactNode } from 'react';

import { Text } from '../../components/ui/Text';
import { BLOB_TARGET, daCapacity, fmt, type DaWorkload } from '../da/workloads';
import { runHref, type Proven, type ProvenCapacity, type Workload } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import type { Bar } from './Bottlenecks';
import { Info } from './Info';
import type { ProvenMark } from './Ladder';
import { day, usageAsOf } from './ProvenCapacity';
import { Tag } from './Tag';

export type BenchState = { configured: boolean; data?: ProvenCapacity; error?: unknown };

const TRAFFIC: Record<Workload, string> = { payment: 'payments', swap: 'swaps', mix: 'mainnet-like traffic' };
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
const compact = (v: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v).toLowerCase();

type Props = Pick<Snapshot, 'ladder' | 'windows' | 'usage' | 'collectedAt'> & {
  bench: BenchState;
  proven: ProvenMark;
  workloads: DaWorkload[];
  bars: Bar[];
  binding: Bar | null;
};

// Only states other than a loaded bench result need a note; a loaded result shows in the cards.
function benchNote({ configured, data, error }: BenchState, proven: ProvenMark, qualified: Snapshot['ladder']['qualified']): ReactNode {
  if (!configured) {
    if (!proven) return null;
    return <>Proven capacity {n(proven.value)} Mgas/s, from the snapshot{qualified.evidence?.map((l) => <span key={l.url}> · <a className="underline" href={l.url}>{l.label}</a></span>)}</>;
  }
  if (error) return 'Could not load bench results. The bench host is reachable only on VPN and must allow this origin via CORS.';
  if (!data) return 'Loading bench results…';
  // A run whose files failed to load is skipped, so an older result at its rate may count instead.
  const partial = data.unknown.length ? `${data.unknown.length} run(s) could not be loaded, so this may be wrong.` : '';
  return data.current.mix ? partial || null : `No main run passed in the last 14 days. ${partial}`.trim();
}

function Lead({ ladder, windows, usage, proven, collectedAt }: Pick<Props, 'ladder' | 'windows' | 'usage' | 'proven' | 'collectedAt'>) {
  const { p50, p99 } = ladder.observed;
  const tps = usage?.transactionsPerSecond;
  const headroom = proven && p50.value ? proven.value / p50.value : null;
  const gas = [p50.value !== null && `${n(p50.value)} Mgas/s median`, p99.value !== null && `${n(p99.value)} p99`].filter(Boolean).join(', ');
  const details = [
    tps && `${n((tps.value * 86_400) / 1e6)}M per day`,
    tps && gas,
    !tps && p99.value !== null && `${n(p99.value)} p99`,
    headroom !== null && `proven capacity is ${headroom < 10 ? headroom.toFixed(1) : Math.round(headroom)}× that`,
    usageAsOf(collectedAt),
  ].filter(Boolean);
  const [value, unit, over, help] = tps
    ? [fmt(tps.value), 'transactions per second', windows[tps.window].label, tps.help]
    : p50.value !== null ? [n(p50.value), 'Mgas/s median', p50.window ? windows[p50.window].label : null, p50.help] : ['—', 'usage not measured', null, null];
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-[44px] font-[650] leading-[1.05] text-bds-gray-100 dark:text-white">
        <span className="tabular-nums">{value}</span>
        <span className="text-[20px] font-[500] text-bds-gray-60">{unit}</span>
        {over ? <span className="text-[15px] font-[400] text-bds-gray-60">averaged over {over}</span> : null}
        {help ? <Info label={`About ${unit}`}>{help}</Info> : null}
      </p>
      <span className="text-[12px] text-bds-gray-60">{details.join(' · ')}</span>
    </div>
  );
}

function Card({ label, proven, workload, todayTps }: { label: string; proven: Proven | null; workload: DaWorkload; todayTps: number | null }) {
  const cap = daCapacity(workload, BLOB_TARGET).txPerSecond;
  const value = proven?.run.tps;
  const pct = (v: number) => `${Math.min(100, (v / value!) * 100)}%`;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-[600] uppercase tracking-wide text-bds-gray-60">{label}</span>
      {value === undefined ? (
        <span className="text-[32px] font-[600] leading-[1.1] text-bds-gray-60">pending</span>
      ) : (
        <a className="text-[32px] tabular-nums font-[600] leading-[1.1] text-base-blue" href={runHref(proven!.run)}>{proven!.atTop ? '≥ ' : ''}{compact(value)}</a>
      )}
      {value === undefined ? null : (
        <div role="img" aria-label={`0 to ${fmt(value)} tx/s`} className="relative mt-3 h-2.5 rounded bg-bds-gray-10 dark:bg-white/10">
          <div className="absolute inset-0 rounded bg-bds-blue-15 dark:bg-bds-blue-80" />
          {todayTps === null ? null : <span data-tick="today" className="absolute -inset-y-1.5 w-0.5 bg-bds-gray-100 dark:bg-white" style={{ left: pct(todayTps) }} />}
          <span data-tick="da" className="absolute -inset-y-1.5 w-0.5 bg-bds-red-60" style={{ left: pct(cap) }} />
        </div>
      )}
      <span className="mt-2 flex items-center gap-1.5 text-[12px]">
        <span className="text-bds-red-60">DA caps at ~{fmt(cap)}</span>
        <Tag tag={workload.tag} />
      </span>
    </div>
  );
}

function FirstLimit({ bars, binding, proven }: { bars: Bar[]; binding: Bar; proven: ProvenMark }) {
  const below = proven && binding.value! < proven.value ? `, below the proven ${n(proven.value)}` : '';
  if (binding.id.startsWith('da-')) {
    const part = (b: Bar) => <>{b.text} Mgas/s of {TRAFFIC[b.id.slice(3) as Workload]} {b.tag ? <Tag tag={b.tag} /> : null}</>;
    const mix = bars.find((b) => b.id === 'da-mix');
    return (
      <><b>First limit: DA.</b> Ethereum&apos;s blob target fills at {part(binding)}{mix && mix !== binding ? <> or {part(mix)}</> : null}{below}.</>
    );
  }
  return proven?.atLeast
    ? <><b>No limit found</b> up to {n(proven.value)} Mgas/s, the top rate tested.</>
    : <><b>First limit: above {n(binding.value!)} Mgas/s</b>, where the next rate tested did not pass.</>;
}

function LastChange({ history }: { history: ProvenCapacity['history'] }) {
  if (history.length < 2) return null;
  const [previous, last] = history.slice(-2);
  const down = last.mgas !== null && previous.mgas !== null && last.mgas < previous.mgas;
  return (
    <span className="text-[12px] text-bds-gray-60">
      {' '}{down ? '↓' : '↑'} from {previous.mgas === null ? 'none' : `${previous.mgas} Mgas/s`} on {day(last.at)}
      {last.compareUrl ? <> · <a className="underline" href={last.compareUrl}>compare</a></> : null}
    </span>
  );
}

export function Headline({ ladder, windows, usage, collectedAt, bench, proven, workloads, bars, binding }: Props) {
  const note = benchNote(bench, proven, ladder.qualified);
  const todayTps = usage?.transactionsPerSecond.value ?? null;
  const workload = (w: Workload) => workloads.find((x) => x.payload === w)!;
  return (
    <section className="flex flex-col gap-5">
      <Text as="h2" variant="headline">How much can Base handle, and how much do we use?</Text>
      <Lead ladder={ladder} windows={windows} usage={usage} proven={proven} collectedAt={collectedAt} />
      <div className="grid grid-cols-1 gap-7 sm:grid-cols-2">
        <Card label="Payments per second, proven" proven={bench.data?.current.payment ?? null} workload={workload('payment')} todayTps={todayTps} />
        <Card label="Swaps per second, proven" proven={bench.data?.current.swap ?? null} workload={workload('swap')} todayTps={todayTps} />
      </div>
      {note ? <Text variant="label.regular" tone="muted">{note}</Text> : null}
      {binding ? (
        <p className="text-[14px]">
          <FirstLimit bars={bars} binding={binding} proven={proven} />
          {bench.data ? <LastChange history={bench.data.history} /> : null}
        </p>
      ) : null}
    </section>
  );
}
