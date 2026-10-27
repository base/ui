import type { ReactNode } from 'react';

import { Text } from '../../components/ui/Text';
import { runHref, type Proven, type ProvenCapacity, type Workload } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import type { Bar } from './Bottlenecks';
import type { ProvenMark } from './Ladder';
import { day, usageAsOf } from './ProvenCapacity';
import { Tag } from './Tag';

export type BenchState = { configured: boolean; data?: ProvenCapacity; error?: unknown };

const STEP_NAME: Record<string, string> = {
  sequencer: 'sequencer', validator_replay: 'validators', proof_node: 'proof node', da: 'DA encoding', tee_proof: 'TEE proving', rpc_sync: 'RPC sync',
};
const TRAFFIC: Record<Workload, string> = { payment: 'payments', swap: 'swaps', mix: 'mainnet-like traffic' };
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

type Props = Pick<Snapshot, 'ladder' | 'windows' | 'translations' | 'collectedAt'> & {
  bench: BenchState;
  proven: ProvenMark;
  bars: Bar[];
  binding: Bar | null;
};

function provenCaption({ configured, data, error }: BenchState, proven: ProvenMark, qualified: Snapshot['ladder']['qualified']): ReactNode {
  if (!configured) {
    if (!proven) return <Tag tag={qualified.tag} />;
    return <>Mgas/s · from the snapshot{qualified.evidence?.map((l) => <span key={l.url}> · <a className="underline" href={l.url}>{l.label}</a></span>)}</>;
  }
  if (error) return 'Could not load bench results. The bench host is reachable only on VPN and must allow this origin via CORS.';
  if (!data) return 'Loading bench results…';
  // A run whose files failed to load is skipped, so an older result at its rate may count instead.
  const partial = data.unknown.length ? ` · ${data.unknown.length} run(s) could not be loaded, so this may be wrong` : '';
  const mix = data.current.mix;
  if (!mix) return `No main run passed in the last 14 days${partial}.`;
  const passed = mix.run.steps.filter((s) => s.status === 'passed').map((s) => STEP_NAME[s.name] ?? s.name);
  return `Mgas/s · ${list(passed)} ${passed.length > 1 ? 'all pass' : 'pass'} on mainnet state${partial}`;
}

function Stat({ label, value, caption }: { label: string; value: string; caption: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-[500] uppercase tracking-wide text-bds-gray-60">{label}</span>
      <span className="font-mono text-[40px] leading-none">{value}</span>
      <span className="text-[13px] text-bds-gray-60">{caption}</span>
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

function translation({ gasPerPayment, gasPerSwap }: Snapshot['translations']): string {
  if (!gasPerPayment && !gasPerSwap) return 'Translation to payments/s and swaps/s: constants pending';
  const per = (c: typeof gasPerPayment, noun: string) => (c ? `${Math.round(1e6 / c.value)} ${noun}/s` : `${noun}/s pending`);
  return `1 Mgas/s ≈ ${per(gasPerPayment, 'payments')} ≈ ${per(gasPerSwap, 'swaps')}`;
}

// Delivered tx/s of each workload's proven run; the rate can only be higher.
function BenchTranslation({ current }: { current: ProvenCapacity['current'] }) {
  const rate = (p: Proven | null, noun: string, what: string) =>
    p ? <a className="underline" href={runHref(p.run)}>≥ {Math.floor(p.run.tps).toLocaleString('en-US')} {noun} ({what})</a> : `${noun} (${what}) pending`;
  return <>{rate(current.payment, 'payments/s', 'B20 transfers')} · {rate(current.swap, 'swaps/s', 'Uniswap v3')}</>;
}

export function Headline({ ladder, windows, translations, collectedAt, bench, proven, bars, binding }: Props) {
  const { p50, p99 } = ladder.observed;
  const window = p50.window ? ` · ${windows[p50.window].label}` : '';
  const headroom = proven && p50.value ? proven.value / p50.value : null;
  return (
    <section className="flex flex-col gap-4">
      <Text as="h2" variant="headline">How much can Base handle, and how much do we use?</Text>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Stat label="Proven capacity" value={proven ? `${proven.atLeast ? '≥ ' : ''}${n(proven.value)}` : '—'} caption={provenCaption(bench, proven, ladder.qualified)} />
        <Stat label="Used today" value={p50.value === null ? '—' : n(p50.value)} caption={<>Mgas/s median · {p99.value === null ? 'p99 not measured' : `${n(p99.value)} p99`}{window}<br />{usageAsOf(collectedAt)}</>} />
        <Stat label="Headroom" value={headroom === null ? '—' : `${headroom < 10 ? headroom.toFixed(1) : Math.round(headroom)}×`} caption="proven ÷ median use" />
      </div>
      {binding ? (
        <p className="text-[14px]">
          <FirstLimit bars={bars} binding={binding} proven={proven} />
          {bench.data ? <LastChange history={bench.data.history} /> : null}
        </p>
      ) : null}
      <Text variant="label.regular" tone="muted">{bench.data ? <BenchTranslation current={bench.data.current} /> : translation(translations)}</Text>
    </section>
  );
}
