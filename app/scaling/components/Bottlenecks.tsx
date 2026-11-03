import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { BLOB_DATA_BYTES, BLOB_TARGET, daCapacity, fmt, L1_SLOT_SECONDS, type DaWorkload } from '../da/workloads';
import { runHref, successfulTps, type PipelineStep, type Proven, type ProvenCapacity, type Run, type Storage, type Workload } from '../proven/capacity';
import { EXECUTE_PAYLOAD_P99_MS, PROOF_LAG_P99_BLOCKS, REPLAY_BLOCKS_PER_SECOND } from './Guardrails';
import { Info } from './Info';
import { day } from './ProvenCapacity';
import type { Snapshot } from '../snapshot.mjs';
import { Tag } from './Tag';

export type Bar = { id: string; label: string; value: number | null; text: string; tag?: DaWorkload['tag']; perSecond?: number };
// One row of the ranked table: a bar, or execution, validators and proof node merged when they share a ceiling.
export type Limit = {
  id: string;
  label: string;
  value: number | null;
  ceiling: string;
  evidence: string;
  tag?: DaWorkload['tag'];
  perSecond?: number;
  workload?: DaWorkload;
  help?: string;
  // Help beside the ceiling itself.
  ceilingHelp?: string;
  runwayYears?: number;
};

export const times = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}×`;
const TH = 'px-3 py-2 text-left text-[11px] font-[600] uppercase tracking-wide text-bds-gray-60';
const TD = 'px-3 py-2.5 align-middle';
const STEP_DOT: Record<PipelineStep['status'], string> = { passed: 'bg-bds-green-50', failed: 'bg-bds-red-50', skipped: 'bg-bds-gray-30', 'not-implemented': 'bg-bds-gray-30' };

// Validators and the proof node within budget at the proven rate have a limit of at least that rate;
// over budget, their limit is somewhere below it.
export function bottleneckBars(workloads: DaWorkload[], proven: Proven | null): Bar[] {
  const da = workloads.map((w): Bar => {
    const { mgasPerSecond: value, txPerSecond } = daCapacity(w, BLOB_TARGET);
    return { id: `da-${w.payload}`, label: w.label, value, text: `${w.tag === 'estimated' ? '~' : ''}${fmt(value)}`, tag: w.tag, perSecond: txPerSecond };
  });
  const run = proven?.run;
  const m = proven?.mgas ?? null;
  const proofs = run?.proofNode?.proofs;
  const replay = run?.replay;
  const executeP99 = proofs?.methods.debug_executePayload?.latency.p99Ms;
  const proofOk = proofs && executeP99 !== undefined && proofs.headLagBlocks.p99 <= PROOF_LAG_P99_BLOCKS && executeP99 <= EXECUTE_PAYLOAD_P99_MS;
  return [
    ...da,
    { id: 'execution', label: 'Sequencer', value: m, text: !proven ? 'no proven run' : proven.atTop ? `≥ ${m} · top rate tested` : `${m}` },
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

const TRAFFIC: Record<Workload, string> = { payment: 'payments', swap: 'swaps', mix: 'transactions' };
const blobRule = (target: number) =>
  `The ceiling is the gas rate that fills the ${target}-blob target: ${target} × ${fmt(BLOB_DATA_BYTES)} bytes per blob ÷ ${L1_SLOT_SECONDS} s per slot ÷ bytes per gas.`;

// Evidence and help for a DA row. `first` marks the lowest DA row, where the shared target is named.
function daText(w: DaWorkload, first: boolean): { evidence: string; help: string } {
  const shared = first ? ', shared by all rollups' : '';
  const bench = w.bench && w.source?.url === runHref(w.bench.run) ? w.bench : null;
  if (bench) {
    const { run, da } = bench;
    const target = da.target ?? BLOB_TARGET;
    const windowMgas = da.result.gas_per_second / 1e6;
    // The DA run reports blobs over its posting window, which runs below the load rate; rescale to the load.
    const blobs = Math.round((da.result.blobs_per_l1_slot * run.mgas) / windowMgas);
    const reverted = run.reverted > 0.01 ? ` ${Math.round(run.reverted * 100)}% of ${TRAFFIC[w.payload]} reverted.` : '';
    return {
      evidence: `Measured in the bench: at ${run.mgas} Mgas/s, needs ${blobs} blobs per L1 slot. Target is ${target}${shared}.${reverted}`,
      help: `Run ${run.outputDir}: ${da.result.bytes_per_gas.toPrecision(3)} compressed bytes per gas (compression ${da.result.compression_ratio.toFixed(1)}×). Over the batch posting window it averaged ${da.result.blobs_per_l1_slot.toFixed(1)} blobs per L1 slot at ${windowMgas.toFixed(1)} Mgas/s; scaling that window to the ${run.mgas} Mgas/s load gives ${blobs}. ${blobRule(target)}`,
    };
  }
  // Without a bench DA run every /scaling workload, the mix included, is an estimate.
  return {
    evidence: `Estimated: no bench DA run yet, so this uses the formula. Target is ${BLOB_TARGET}${shared}.`,
    help: `Estimated ${fmt(w.bytesPerTx)} compressed bytes and ${fmt(w.gasPerTx)} gas per transaction. ${blobRule(BLOB_TARGET)}`,
  };
}

// Lowest ceiling first; limits without a ceiling keep their order after the ranked ones.
// `mainnetGasPerTx` (today's usage p50 ÷ tx/s) converts every row not specific to one workload, as the traffic tile does.
export function rankLimits(bars: Bar[], workloads: DaWorkload[], proven: Proven | null, disk: Limit[] = [], mainnetGasPerTx: number | null = null): Limit[] {
  const m = proven?.mgas ?? null;
  const text = new Map<string, (first: boolean) => { evidence: string; help: string }>();
  const da = bars.filter((b) => b.id.startsWith('da-')).map((b): Limit => {
    const w = workloads.find((x) => `da-${x.payload}` === b.id)!;
    text.set(b.id, (first) => daText(w, first));
    // Payments and swaps convert with their own transactions; the mix, like every shared row, at today's mainnet average below.
    const mix = b.id === 'da-mix';
    const perSecond = mix ? undefined : b.perSecond;
    const bench = w.bench ? ` (the bench mix${w.gasPerTx < mainnetGasPerTx! ? ' is lighter' : ''}: ~${Math.round(w.gasPerTx / 1e3)}k)` : '';
    const ceilingHelp = mix && mainnetGasPerTx ? `tx/s at today's mainnet average of ~${Math.round(mainnetGasPerTx! / 1e3)}k gas per transaction${bench}.` : undefined;
    return { id: b.id, label: b.label, value: b.value, ceiling: b.text, evidence: '', tag: b.tag, perSecond, workload: w, ceilingHelp };
  });
  const core = bars.filter((b) => !b.id.startsWith('da-'));
  const atLeast = (atTop: boolean) => (atTop ? `≥ ${m}` : `${m}`);
  const execution: Limit[] = core.map((b) => ({
    id: b.id,
    label: b.label,
    value: b.value,
    ceiling: b.value === null ? '—' : atLeast(b.id !== 'execution' || proven!.atTop),
    evidence: b.value === null ? b.text : b.id === 'execution' && !proven!.atTop ? 'the next rate tested did not pass' : b.text.split(' · ').slice(1).join(' · '),
  }));
  const sorted = [...da, ...execution, ...disk].toSorted((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
  const firstDa = sorted.find((l) => l.id.startsWith('da-'))?.id;
  const atMainnet = (l: Limit) => l.perSecond === undefined && mainnetGasPerTx !== null && l.value !== null && l.value > 0 ? { perSecond: (l.value * 1e6) / mainnetGasPerTx } : {};
  return sorted.map((l) => ({ ...l, ...atMainnet(l), ...(text.has(l.id) ? text.get(l.id)!(l.id === firstDa) : {}) }));
}

export type StorageSource = { storage: Storage; run: Run };

export const bytes = (n: number) => (n >= 1e12 ? `${(n / 1e12).toFixed(1)} TB` : `${(n / 1e9).toFixed(1)} GB`);
const WORKLOAD: Record<Workload, string> = { mix: 'mainnet mix', payment: 'payments', swap: 'swaps' };

// Storage data from the run with the heaviest transactions (most gas per successful transaction); ties go to the newest.
// Lighter bench transactions than mainnet's overstate history bytes per gas.
export function pickStorage(data: ProvenCapacity | undefined): StorageSource | null {
  if (!data) return null;
  const { current, da } = data;
  const gasPerTx = (r: Run) => (successfulTps(r) > 0 ? r.gps / successfulTps(r) : 0);
  const runs = [current.mix?.run, current.payment?.run, current.swap?.run, da.mix, da.payment, da.swap].filter((r): r is Run => !!r?.storage);
  const run = runs.toSorted((a, b) => gasPerTx(b) - gasPerTx(a) || b.createdAt - a.createdAt)[0];
  return run ? { storage: run.storage!, run } : null;
}

const YEAR_SECONDS = 31_557_600;
const HEAVIEST = 'Uses the workload with the heaviest transactions, because bench workloads with lighter transactions than mainnet overstate history bytes per gas. A production measurement will replace this.';
const days = (seconds: number) => Math.round(seconds / 86_400);
const years = (n: number) => (n === 1 ? 'one year' : `${n} years`);

// Disk ceilings: the gas rate at which the budget just holds what each node keeps. Bench bytes per gas
// is a lower bound (the sequencer prunes history), so both ceilings are upper bounds.
export function diskLimits(source: StorageSource | null, { policy, production }: Pick<Snapshot, 'policy' | 'production'>): Limit[] {
  const runway = policy?.runwayYears;
  const state = production?.stateBytesPerGas;
  const archiveNow = production?.archiveBytes;
  const policyText = runway
    ? `runway policy: full node ${years(runway.fullNode)}, archive ${years(runway.archive)}${runway.help ? ` (${runway.help})` : ''}`
    : 'no runway policy is set';
  type Row = { mgas: number; years: number; evidence: string; overBudget: string; help: string };
  const row = (id: string, label: string, need: string | null, r?: () => Row): Limit => {
    if (need !== null) return { id, label, value: null, ceiling: '—', evidence: `needs ${need}`, help: `Needs ${need}; ${policyText}.` };
    const { mgas, years: runwayYears, evidence, overBudget, help } = r!();
    return mgas <= 0
      ? { id, label, value: 0, ceiling: 'over budget', evidence: overBudget, help, runwayYears }
      : { id, label, value: mgas, ceiling: `≤ ${fmt(mgas)}`, evidence, help, runwayYears };
  };
  if (!source) {
    const need = 'a bench storage-growth run';
    return [row('disk-full', 'Full node', need), row('disk-archive', 'Archive node', need)];
  }
  const { storage: { diskBudgetBytes: budget, bytesPerGas, current, fullNode }, run } = source;
  const from = `the ${WORKLOAD[run.workload]} run`;
  const budgetText = `${bytes(budget)} disk budget (a bench config assumption)`;

  const full = row(
    'disk-full', 'Full node',
    !runway ? 'a runway policy' : !state ? 'production state growth' : bytesPerGas.proofs === null ? 'proof storage growth' : null,
    () => {
      const historyDays = days(fullNode.historyWindowSeconds);
      const proofDays = days(fullNode.proofWindowSeconds);
      const perMgas = 1e6 * (bytesPerGas.history * fullNode.historyWindowSeconds + bytesPerGas.proofs! * fullNode.proofWindowSeconds + state!.value * YEAR_SECONDS * runway!.fullNode);
      const kept = `${historyDays} days of history, ${proofDays} days of proofs and ${years(runway!.fullNode)} of state growth`;
      return {
        mgas: (budget - current.state) / perMgas,
        years: runway!.fullNode,
        evidence: `Projected from bench growth: ${kept} fit in ${bytes(budget)}. Upper bound.`,
        overBudget: `Projected from bench growth: today's state (${bytes(current.state)}) leaves no room in ${bytes(budget)}.`,
        help: `Inputs: ${budgetText}; today's state ${bytes(current.state)}, measured at ${from}'s snapshot; ${bytesPerGas.history.toPrecision(3)} bytes per gas of history and ${bytesPerGas.proofs!.toPrecision(3)} of proofs from ${from}; ${state!.value} bytes per gas of production state growth${state!.source ? ` from ${state!.source}` : ''}; ${policyText}. Upper bound: history bytes per gas is a lower bound, because the sequencer prunes history. ${HEAVIEST}`,
      };
    },
  );

  // storage-growth.json's archive bytes per gas sums every MDBX table, state included, with static files
  // and RocksDB. Bench runs write almost no new state, so production state growth is added on top; that
  // double counts the bench run's tiny state growth.
  const archive = row(
    'disk-archive', 'Archive node',
    !runway ? 'a runway policy' : !archiveNow ? 'the production archive size' : null,
    () => {
      const perGas = bytesPerGas.archive + (state?.value ?? 0);
      const stateText = state
        ? ` plus ${state.value} bytes per gas of mainnet state growth${state.source ? ` from ${state.source}` : ''}, since the bench run writes almost no new state`
        : ' (bench state only)';
      return {
        mgas: (budget - archiveNow!.value) / (1e6 * perGas * YEAR_SECONDS * runway!.archive),
        years: runway!.archive,
        evidence: `Projected from bench growth: ${years(runway!.archive)} ${runway!.archive === 1 ? 'fills' : 'fill'} the ${bytes(budget)} disk (${bytes(archiveNow!.value)} used today). Upper bound.`,
        overBudget: `Projected from bench growth: today's archive (${bytes(archiveNow!.value)}) already fills the ${bytes(budget)} disk.`,
        help: `Inputs: ${budgetText}; today's archive ${bytes(archiveNow!.value)} from ${archiveNow!.source} on ${archiveNow!.asOf}${archiveNow!.note ? ` (${archiveNow!.note})` : ''}; ${bytesPerGas.archive.toPrecision(3)} bytes per gas from ${from}${stateText}; ${policyText}. Upper bound: bench bytes per gas is a lower bound, because the sequencer prunes history. That workload may write more bytes per gas than mainnet traffic does (Base's whole archive is ${bytes(archiveNow!.value)}), which makes the ceiling conservative in the other direction. ${HEAVIEST}`,
      };
    },
  );
  return [full, archive];
}

function LastChange({ history }: { history: ProvenCapacity['history'] }) {
  const [previous, last] = history.slice(-2);
  const down = last.mgas !== null && previous.mgas !== null && last.mgas < previous.mgas;
  return (
    <>
      {down ? '↓' : '↑'} from {previous.mgas === null ? 'none' : `${previous.mgas} Mgas/s`} on {day(last.at)}
      {last.compareUrl ? <> · <a className="underline" href={last.compareUrl}>compare</a></> : null}
    </>
  );
}

const DT = 'text-bds-gray-60';

function ProvenBy({ proven, history }: { proven: Proven; history: ProvenCapacity['history'] }) {
  const { run } = proven;
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <Text as="h3" variant="label">Proven by</Text>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className={DT}>Run</dt>
        <dd className="break-all"><a className="underline" href={runHref(run)}>{run.outputDir}</a></dd>
        <dt className={DT}>Rate</dt>
        <dd className="tabular-nums">{run.mgas} → {(run.gps / 1e6).toFixed(1)} Mgas/s</dd>
        <dt className={DT}>Commit</dt>
        <dd><a className="font-mono underline" href={`https://github.com/base/base/commit/${run.commit}`}>{run.commit.slice(0, 7)}</a></dd>
        <dt className={DT}>Date</dt>
        <dd>{day(run.createdAt)}</dd>
        {history.length >= 2 ? <><dt className={DT}>Change</dt><dd><LastChange history={history} /></dd></> : null}
        <dt className={DT}>Steps</dt>
        <dd>
          <ul aria-label="Pipeline steps" className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-bds-gray-60">
            {run.steps.map((s) => (
              <li key={s.name} className="flex items-center gap-1" title={s.reason ?? undefined}>
                <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', STEP_DOT[s.status])} />
                {s.name.replace('_', ' ')} {s.status}
              </li>
            ))}
          </ul>
        </dd>
      </dl>
    </div>
  );
}

// A ≤ or ≥ ceiling bounds its tx/s the same way; other ceilings convert approximately.
const bound = (ceiling: string) => /^[≤≥]/.exec(ceiling)?.[0];
const ceilingHelp = (gasPerTx: number | null) =>
  `tx/s for payments and swaps uses that workload's transactions; ${gasPerTx ? `every other row uses today's mainnet average of ~${Math.round(gasPerTx / 1e3)}k gas per transaction` : 'the snapshot has no transactions per second, so every other row stays in Mgas/s'}. Reverted transactions still use gas and blob space.`;

// Validators and the proof node count as execution, alongside the sequencer.
const category = (id: string) => (id.startsWith('da-') ? 'DA' : id.startsWith('disk-') ? 'Disk' : 'Execution');

export function Bottlenecks({ limits, max, gasLimit, proven, history, mainnetGasPerTx = null }: { limits: Limit[]; max: number; gasLimit: number | null; proven: Proven | null; history: ProvenCapacity['history']; mainnetGasPerTx?: number | null }) {
  const pct = (v: number) => `${(v / max) * 100}%`;
  const ranked = limits.filter((l) => l.value !== null).length;
  const fixed = [
    { category: 'Execution', label: 'TEE proving', evidence: 'Not measured yet.' },
    { category: 'RPC', label: 'RPC under sync', evidence: 'Not measured yet.' },
  ];
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">What breaks first <span className="text-bds-gray-60">· Mgas/s</span></Text>
      <Card className="overflow-x-auto bg-background dark:bg-white/5">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-bds-gray-10 dark:border-white/10">
              <th className={TH}>#</th><th className={TH}>Category</th><th className={TH}>Limit</th><th className={cn(TH, 'text-right')}><span className="inline-flex items-center gap-1">Ceiling <Info label="About the ceiling">{ceilingHelp(mainnetGasPerTx)}</Info></span></th><th className={cn(TH, 'w-[28%]')} /><th className={TH}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {limits.map((l, i) => {
              const next = i === 0 && l.value !== null;
              return (
                <tr key={l.id} className="border-b border-bds-gray-10 dark:border-white/10">
                  <td className={cn(TD, 'text-bds-gray-60')}>{i < ranked ? i + 1 : '—'}</td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{category(l.id)}</td>
                  <td className={cn(TD, 'whitespace-nowrap')}>
                    {l.label}
                    {l.help ? <> <Info label={`About ${l.label}`}>{l.help}</Info></> : null}
                    {next ? <span className="ml-1.5 rounded bg-bds-red-60 px-1.5 py-px text-[11px] font-[600] text-white">next</span> : null}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums', next && 'text-bds-red-60')}>
                    <span className="whitespace-nowrap">{l.ceiling}{l.value !== null && l.value > 0 ? ' Mgas/s' : ''}</span>
                    {l.perSecond === undefined ? null : <span className="block whitespace-nowrap text-[12px] text-bds-gray-60 lg:ml-1 lg:inline">{bound(l.ceiling) ?? '≈'} {fmt(l.perSecond)} tx/s</span>}
                    {l.ceilingHelp ? <span className="ml-1 inline-flex align-middle"><Info label={`About the ${l.label} ceiling`}>{l.ceilingHelp}</Info></span> : null}
                    {/* Measured is the norm; only the exception is tagged. */}
                    {l.tag === 'estimated' ? <span className="ml-1 whitespace-nowrap"><Tag tag={l.tag} /></span> : null}
                  </td>
                  <td className={TD}>
                    <div className="relative h-2.5 min-w-[90px] rounded bg-bds-gray-10 dark:bg-white/10">
                      {l.value === null ? null : <div className={cn('absolute inset-y-0 left-0 rounded', next ? 'bg-bds-red-60' : 'bg-bds-blue-30')} style={{ width: pct(l.value) }} />}
                      {gasLimit === null ? null : <span className="absolute -inset-y-1 border-l-[1.5px] border-dashed border-bds-orange-60" style={{ left: pct(gasLimit) }} />}
                    </div>
                  </td>
                  <td className={cn(TD, 'min-w-[14rem] text-[12px]', l.tag === 'estimated' || l.value === null ? 'text-bds-gray-60' : '')}>{l.evidence}</td>
                </tr>
              );
            })}
            {fixed.map((f) => (
              <tr key={f.label} className="border-b border-bds-gray-10 text-bds-gray-60 last:border-0 dark:border-white/10">
                <td className={TD}>—</td><td className={TD}>{f.category}</td><td className={TD}>{f.label}</td><td className={cn(TD, 'text-right')}>—</td><td className={TD} /><td className={cn(TD, 'text-[12px]')}>{f.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {proven ? <ProvenBy proven={proven} history={history} /> : null}
    </section>
  );
}
