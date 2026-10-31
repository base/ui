import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { BLOB_DATA_BYTES, BLOB_TARGET, fmt, L1_SLOT_SECONDS } from '../da/workloads';
import { proofLimits, successfulTps, type ProvenCapacity, type Run, type Workload } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { bytes, diskLimits, OLDER_RUN, times, type Limit } from './Bottlenecks';
import { REPLAY_BLOCKS_PER_SECOND } from './Guardrails';
import { Info } from './Info';

const COLUMNS: [Workload, string, string][] = [['payment', 'Pay', 'Payments (B20)'], ['swap', 'Swap', 'Swaps (Uniswap v3)'], ['mix', 'Mix', 'Mainnet mix (bench run)']];
const NAME: Record<Workload, string> = { payment: 'payments', swap: 'swaps', mix: 'mix' };
const YEAR_SECONDS = 31_557_600;
const NO_RUN = 'no proven run for this workload';
const NOT_IN_RUN = 'not in this run';
const NO_STORAGE = 'needs a run with storage measurement';

type Cell = { value: string; sub?: string[]; bad?: boolean } | { why: string };
type Row = { label: string; help: string; cells: Record<Workload, Cell> };
type Category = 'da' | 'disk-archive' | 'disk-full' | 'proof-history' | 'witness-generation' | 'validators' | 'execution';
type SubsystemCard = { id: Category; title: string; takeaway: string; bad: boolean; rows: Row[] };

const and = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const ms = (n: number) => `${Math.round(n)} ms`;
const size = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(1)} KB`);
// " at 400" when every run shares a rate; otherwise each cell is at its own run's rate.
const atRate = (runs: (Run | undefined)[]) => {
  const rates = [...new Set(runs.filter((r) => r !== undefined).map((r) => r.mgas))];
  return rates.length === 1 ? ` at ${rates[0]}` : rates.length > 1 ? ' at each run’s rate' : '';
};
const cells = (runs: Record<Workload, Run | undefined>, value: (run: Run) => Cell, missing = NO_RUN) =>
  Object.fromEntries(COLUMNS.map(([w]) => [w, runs[w] ? value(runs[w]) : { why: missing }])) as Record<Workload, Cell>;

// DA ceiling at the blob target with the run's own compressed bytes per gas, as in the ranked table.
const daCeiling = ({ result }: NonNullable<Run['da']>) => (BLOB_TARGET * BLOB_DATA_BYTES) / L1_SLOT_SECONDS / (result.frame_bytes / result.gas_used) / 1e6;
// The posting window's blobs per slot, rescaled from its gas rate to the run's load rate.
const blobsAt = (run: Run) => Math.round((run.da!.result.blobs_per_l1_slot * run.mgas) / (run.da!.result.gas_per_second / 1e6));

function daCard(da: ProvenCapacity['da'], gasLimit: number | null): SubsystemCard {
  const runs = Object.fromEntries(COLUMNS.map(([w]) => [w, da[w]?.da ? da[w]! : undefined])) as Record<Workload, Run | undefined>;
  const measured = COLUMNS.filter(([w]) => runs[w]);
  const binding = measured.filter(([w]) => gasLimit !== null && daCeiling(runs[w]!.da!) < gasLimit).map(([w]) => NAME[w]);
  return {
    id: 'da',
    title: 'DA',
    takeaway: !measured.length ? 'not measured yet' : binding.length ? `binding for ${and(binding)}` : gasLimit === null ? 'no gas limit to compare against' : `below target at the ${gasLimit} Mgas/s gas limit`,
    bad: binding.length > 0,
    rows: [
      {
        label: `Blobs per L1 slot${atRate(Object.values(runs))}`,
        help: `Blobs each L1 slot needs at the run's load rate: the batch posting window's average blobs per slot, scaled from the window's gas rate to the load rate. The target is ${BLOB_TARGET}, shared by all rollups.`,
        cells: cells(runs, (r) => ({ value: fmt(blobsAt(r)) }), NOT_IN_RUN),
      },
      {
        label: 'Ceiling (Mgas/s)',
        help: `Gas rate that fills the ${BLOB_TARGET}-blob target: ${BLOB_TARGET} × ${BLOB_DATA_BYTES.toLocaleString('en-US')} bytes per blob ÷ ${L1_SLOT_SECONDS} s per slot ÷ the run's compressed bytes per gas. Mix is the bench run's mainnet mix, as in What breaks first.`,
        cells: cells(runs, (r) => ({ value: fmt(daCeiling(r.da!)), bad: gasLimit !== null && daCeiling(r.da!) < gasLimit }), NOT_IN_RUN),
      },
    ],
  };
}

function diskCards(runs: Record<Workload, Run | undefined>, snapshot: Pick<Snapshot, 'policy' | 'production'>): SubsystemCard[] {
  const withStorage = Object.values(runs).filter((r) => r?.storage);
  const runway = snapshot.policy?.runwayYears;
  const state = snapshot.production?.stateBytesPerGas?.value;
  const storageCells = (value: (run: Run) => Cell) => cells(runs, (r) => (r.storage ? value(r) : { why: NO_STORAGE }));
  const ceiling = (id: string) => (r: Run): Cell => {
    const limit = diskLimits({ storage: r.storage!, run: r }, snapshot).find((l) => l.id === id)!;
    return limit.value === null ? { why: limit.evidence } : limit.value === 0 ? { value: 'over budget', bad: true } : { value: limit.ceiling };
  };
  const card = (id: Category, title: string, years: number | undefined, rows: Row[]): SubsystemCard => ({
    id, title, rows, bad: false,
    takeaway: !withStorage.length ? 'not measured yet' : years ? `${years}-year runway` : 'no runway policy',
  });
  const ceilingLabel = (years: number | undefined) => `Ceiling${years ? ` (${years}-year runway)` : ''}`;
  const ceilingHelp = 'Highest gas rate at which the disk budget holds the runway, from What breaks first. An upper bound: bench bytes per gas is a lower bound, because the sequencer prunes history.';
  return [
    card('disk-archive', 'Disk · archive', runway?.archive, [
      {
        label: `Growth${atRate(withStorage)}`,
        help: `Archive growth per year at the run's rate: the run's archive bytes per gas${state ? ` plus ${state} bytes per gas of mainnet state growth` : ''}. A lower bound, because the sequencer prunes history.`,
        cells: storageCells((r) => ({ value: `≥ ${bytes((r.storage!.bytesPerGas.archive + (state ?? 0)) * r.mgas * 1e6 * YEAR_SECONDS)}/yr` })),
      },
      { label: ceilingLabel(runway?.archive), help: ceilingHelp, cells: storageCells(ceiling('disk-archive')) },
    ]),
    card('disk-full', 'Disk · full node', runway?.fullNode, [
      {
        label: `Size${atRate(withStorage)}`,
        help: 'History and proofs a full node keeps at the run\'s rate: history bytes per gas over the history window plus proof bytes per gas over the proof window.',
        cells: storageCells(({ mgas, storage }) => {
          const { bytesPerGas: b, fullNode: f } = storage!;
          return b.proofs === null ? { why: NOT_IN_RUN } : { value: bytes(mgas * 1e6 * (b.history * f.historyWindowSeconds + b.proofs * f.proofWindowSeconds)) };
        }),
      },
      { label: ceilingLabel(runway?.fullNode), help: ceilingHelp, cells: storageCells(ceiling('disk-full')) },
    ]),
  ];
}

// One card per proof-node limit, judged by each run's own budget; older runs report none.
function proofCards(runs: Record<Workload, Run | undefined>): SubsystemCard[] {
  const proofs = (r: Run) => r.proofNode?.proofs ?? null;
  const measured = COLUMNS.filter(([w]) => runs[w] && proofs(runs[w]));
  const names = (keep: (r: Run) => boolean) => measured.filter(([w]) => keep(runs[w]!)).map(([w]) => NAME[w]);
  const older = names((r) => !proofLimits(r));
  const takeaway = (failed: string[], verdict: string) => {
    const parts = [failed.length && `${verdict} for ${and(failed)}`, older.length && `budget unknown for ${and(older)}`].filter((s): s is string => !!s);
    return !measured.length ? 'not measured yet' : parts.join('; ') || 'within budget';
  };
  const proofCells = (value: (p: NonNullable<ReturnType<typeof proofs>>, r: Run) => Cell) => cells(runs, (r) => {
    const p = proofs(r);
    return p ? value(p, r) : { why: NOT_IN_RUN };
  });
  const limitCells = (value: (l: NonNullable<ReturnType<typeof proofLimits>>, r: Run) => Cell) => proofCells((_, r) => {
    const l = proofLimits(r);
    return l ? value(l, r) : { why: OLDER_RUN };
  });
  const slow = names((r) => proofLimits(r)?.proofHistory.pass === false);
  const over = names((r) => proofLimits(r)?.witnessGeneration.pass === false);
  return [
    {
      id: 'proof-history',
      title: 'Proof history',
      takeaway: takeaway(slow, 'below budget'),
      bad: slow.length > 0,
      rows: [
        {
          label: 'Headroom (budget)',
          help: 'Proof history throughput ÷ the chain’s real-time block rate, and the minimum the bench requires.',
          cells: limitCells(({ proofHistory: h }) => ({ value: `${times(h.headroom)} (≥ ${times(h.minHeadroom)})`, bad: !h.pass })),
        },
        {
          label: 'Ceiling (Mgas/s)',
          help: 'The run’s rate × headroom. A lower bound, because the bench underestimates throughput.',
          cells: limitCells(({ proofHistory: h }, r) => ({ value: `≥ ${fmt(r.mgas * h.headroom)}` })),
        },
        {
          label: 'Lag p99 (max)',
          help: 'Blocks proof history trails the inserted head, p99 and max over the run. Recorded only: the unpaced replay runs ahead of real time.',
          cells: proofCells(({ headLagBlocks: l }) => ({ value: `${l.p99} (${l.max})` })),
        },
      ],
    },
    {
      id: 'witness-generation',
      title: 'Witness generation',
      takeaway: takeaway(over, 'over budget'),
      bad: over.length > 0,
      rows: [
        {
          label: 'executePayload p99, ms (budget)',
          help: 'p99 latency of debug_executePayload on the proof node, and the budget the bench applies.',
          cells: proofCells((p, r) => {
            const w = proofLimits(r)?.witnessGeneration;
            const p99 = p.methods.debug_executePayload?.latency.p99Ms;
            return w ? { value: `${Math.round(w.p99Ms)} (≤ ${w.maxP99Ms})`, bad: !w.pass } : p99 === undefined ? { why: NOT_IN_RUN } : { value: `${Math.round(p99)}`, sub: ['budget unknown'] };
          }),
        },
        {
          label: 'Estimated ceiling (Mgas/s)',
          help: 'The run’s rate × budget ÷ p99, assuming p99 grows linearly with gas per block.',
          cells: limitCells(({ witnessGeneration: w }, r) => ({ value: `~${fmt((r.mgas * w.maxP99Ms) / w.p99Ms)}` })),
        },
        {
          label: 'Witness p50',
          help: 'Median execution witness size the proof node serves per block.',
          cells: proofCells(({ witnessBytes: w }) => (w.samples ? { value: size(w.p50) } : { why: NOT_IN_RUN })),
        },
      ],
    },
  ];
}

function validatorCard(runs: Record<Workload, Run | undefined>): SubsystemCard {
  const measured = COLUMNS.filter(([w]) => runs[w]?.replay);
  const behind = measured.filter(([w]) => !runs[w]!.replay!.match || runs[w]!.replay!.blocksPerSecond < REPLAY_BLOCKS_PER_SECOND).map(([w]) => NAME[w]);
  const replayCells = (value: (r: NonNullable<Run['replay']>) => Cell) => cells(runs, (r) => (r.replay ? value(r.replay) : { why: NOT_IN_RUN }));
  return {
    id: 'validators',
    title: 'Validators',
    takeaway: !measured.length ? 'not measured yet' : behind.length ? `${and(behind)} ${behind.length === 1 ? 'does' : 'do'} not keep up` : 'all keep up',
    bad: behind.length > 0,
    rows: [
      {
        label: 'Replay speed',
        help: `How many times faster than real time a validator replays the run's blocks: blocks replayed per second ÷ the ${REPLAY_BLOCKS_PER_SECOND} the chain produces. Below 1× it falls behind.`,
        cells: replayCells((r) => ({ value: times(r.blocksPerSecond / REPLAY_BLOCKS_PER_SECOND), bad: !r.match || r.blocksPerSecond < REPLAY_BLOCKS_PER_SECOND })),
      },
      {
        label: 'newPayload p50 / p99',
        help: 'Validator engine_newPayload latency during replay, p50 and p99.',
        cells: replayCells(({ newPayload: n }) => ({ value: `${Math.round(n.p50Ms)} / ${ms(n.p99Ms)}` })),
      },
    ],
  };
}

function sequencerCard(runs: Record<Workload, Run | undefined>): SubsystemCard {
  const rates = [...new Set(Object.values(runs).flatMap((r) => (r ? [r.mgas] : [])))].sort((a, b) => a - b);
  return {
    id: 'execution',
    title: 'Sequencer',
    takeaway: !rates.length ? 'no proven run' : `${rates.length === 1 ? rates[0] : `${rates[0]}–${rates.at(-1)}`} delivered`,
    bad: false,
    rows: [
      {
        label: 'Delivered (Mgas/s)',
        help: 'Gas rate the load test delivered, and successful transactions per second; reverted transactions use gas but are not counted.',
        cells: cells(runs, (r) => ({
          value: (r.gps / 1e6).toFixed(1),
          sub: [`${fmt(successfulTps(r))} tx/s`, ...(r.reverted > 0.01 ? [`${Math.round(r.reverted * 100)}% reverted`] : [])],
        })),
      },
      {
        label: 'Block latency p50 / p99',
        help: 'Time from sending a transaction to seeing it in a block, from the load test.',
        cells: cells(runs, (r) => (r.blockLatency ? { value: `${Math.round(r.blockLatency.p50Ms)} / ${ms(r.blockLatency.p99Ms)}` } : { why: NOT_IN_RUN })),
      },
    ],
  };
}

const MATCHES: Record<Category, (id: string) => boolean> = {
  da: (id) => id.startsWith('da-'),
  'disk-archive': (id) => id === 'disk-archive',
  'disk-full': (id) => id === 'disk-full',
  'proof-history': (id) => id === 'proof-history',
  'witness-generation': (id) => id === 'witness-generation',
  validators: (id) => id === 'validators',
  execution: (id) => id === 'execution',
};

// Cards follow the ranked table: a category's first ranked row sets its place; unranked ones keep the default order.
export function subsystemCards(data: ProvenCapacity | undefined, limits: Limit[], snapshot: Pick<Snapshot, 'policy' | 'production'>, gasLimit: number | null): SubsystemCard[] {
  const runs = Object.fromEntries(COLUMNS.map(([w]) => [w, data?.current[w]?.run])) as Record<Workload, Run | undefined>;
  const da = data?.da ?? { mix: null, payment: null, swap: null };
  const cards = [daCard(da, gasLimit), ...diskCards(runs, snapshot), ...proofCards(runs), validatorCard(runs), sequencerCard(runs)];
  const rank = (c: SubsystemCard) => {
    const i = limits.findIndex((l) => l.value !== null && MATCHES[c.id](l.id));
    return i < 0 ? Infinity : i;
  };
  return cards.toSorted((a, b) => rank(a) - rank(b));
}

const TH = 'px-2 py-1.5 min-[760px]:px-3 text-right text-[11px] font-[600] uppercase tracking-wide text-bds-gray-60';
const TD = 'px-2 py-1.5 min-[760px]:px-3';

function Value({ cell }: { cell: Cell }) {
  if ('why' in cell) {
    return <span className="whitespace-nowrap text-bds-gray-60" title={cell.why}>—<span className="sr-only"> ({cell.why})</span></span>;
  }
  return (
    <>
      {/* Each side of " / " stays whole; narrow cards break between them. */}
      <span className={cn(cell.bad && 'text-bds-red-60')}>{cell.value.split(' / ').map((part, i) => <span key={i}>{i > 0 ? ' / ' : null}<span className="whitespace-nowrap">{part}</span></span>)}</span>
      {cell.sub?.map((s) => <span key={s} className="block whitespace-nowrap text-[12px] text-bds-gray-60">{s}</span>)}
    </>
  );
}

export function WorkloadSubsystems({ cards }: { cards: SubsystemCard[] }) {
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="headline">Subsystems by workload</Text>
      <div className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.id} className="flex flex-col gap-1 bg-background py-3 dark:bg-white/5">
            <h3 className="px-3 text-[14px] font-[600]">
              {c.title} <span className={cn('text-[12px] font-[400]', c.bad ? 'text-bds-red-60' : 'text-bds-gray-60')}>· {c.takeaway}</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-bds-gray-10 dark:border-white/10">
                    <th className={cn(TH, 'text-left')}><span className="sr-only">Metric</span></th>
                    {COLUMNS.map(([w, short, full]) => <th key={w} className={TH} title={full}><abbr className="no-underline" title={full}>{short}</abbr></th>)}
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((r) => (
                    <tr key={r.label} className="border-b border-bds-gray-10 last:border-0 dark:border-white/10">
                      <td className={cn(TD, 'text-left')}>
                        {r.label} <span className="inline-flex align-middle"><Info label={`About ${r.label}`}>{r.help}</Info></span>
                      </td>
                      {COLUMNS.map(([w]) => <td key={w} className={cn(TD, 'text-right tabular-nums min-[760px]:whitespace-nowrap')}><Value cell={r.cells[w]} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
