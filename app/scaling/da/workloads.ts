import { runHref, type Da, type ProvenCapacity, type Run, type Workload } from '../proven/capacity';
import type { Ceiling, Link } from '../snapshot.mjs';

// Ethereum's blob target and max per L1 block since BPO2 (2026-01-07), and the data one blob carries.
export const BLOB_TARGET = 14;
export const BLOB_MAX = 21;
const BLOB_DATA_BYTES = 130_044;
const L1_SLOT_SECONDS = 12;

export type DaWorkload = {
  label: string;
  payload: Workload;
  benchWorkload: string;
  gasPerTx: number;
  bytesPerTx: number;
  tag: 'measured' | 'estimated';
  asOf: string | null;
  source?: Link;
  // The latest bench run's DA step, shown beside the row whether or not it set bytes/tx.
  bench?: { run: Run; da: Da };
};

// Bytes per transaction are compressed batch frame bytes per non-deposit transaction from
// `base-bench da`, the bytes that fill a blob; gas per transaction for bench workloads comes from
// the load-test calibration (etc/scripts/local/mainnet-mix.py in base/base).
export const DA_WORKLOADS: DaWorkload[] = [
  { label: 'Payments (B20)', payload: 'payment', benchWorkload: 'b20-transfer', gasPerTx: 37_743, bytesPerTx: 100, tag: 'estimated', asOf: null },
  { label: 'Swaps', payload: 'swap', benchWorkload: 'uniswap-swap', gasPerTx: 143_987, bytesPerTx: 190, tag: 'estimated', asOf: null },
  {
    label: 'Mainnet mix',
    payload: 'mix',
    benchWorkload: 'mainnet blocks 53,091,727–53,095,326',
    gasPerTx: 193_349,
    bytesPerTx: 154.7,
    tag: 'measured',
    asOf: '2026-10-26T02:00:00Z',
    source: { label: 'base-bench da, mainnet 2 h', url: 'https://github.com/base/base/pull/6215' },
  },
];

// A bench DA run replaces an estimate with frame_bytes and gas_used per successful transaction (reverted
// ones still use gas and blob space), so bytes/tx ÷ gas/tx is the run's bytes per gas and tx/s counts
// successful transactions only. The mainnet mix keeps its measurement from real
// mainnet blocks, which the synthetic bench mix only approximates.
export function daWorkloads(da: ProvenCapacity['da'] | undefined, workloads: DaWorkload[] = DA_WORKLOADS): DaWorkload[] {
  return workloads.map((w) => {
    const run = da?.[w.payload];
    if (!run?.da) return w;
    const bench = { run, da: run.da };
    if (w.tag === 'measured') return { ...w, bench };
    const { frame_bytes, gas_used } = run.da.result;
    const transactions = run.da.result.transactions * (1 - run.reverted);
    return {
      ...w,
      gasPerTx: gas_used / transactions,
      bytesPerTx: frame_bytes / transactions,
      tag: 'measured',
      asOf: new Date(run.createdAt).toISOString(),
      source: { label: `bench ${run.mgas} Mgas/s run`, url: runHref(run) },
      bench,
    };
  });
}

export function daCapacity(w: DaWorkload, blobs: number): { txPerSecond: number; mgasPerSecond: number } {
  const txPerSecond = (blobs * BLOB_DATA_BYTES) / L1_SLOT_SECONDS / w.bytesPerTx;
  return { txPerSecond, mgasPerSecond: (txPerSecond * w.gasPerTx) / 1e6 };
}

export function bindingWorkload(workloads: DaWorkload[] = DA_WORKLOADS): DaWorkload {
  const mgas = (w: DaWorkload) => daCapacity(w, BLOB_TARGET).mgasPerSecond;
  return workloads.reduce((a, b) => (mgas(b) < mgas(a) ? b : a));
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// The DA ceiling is the lowest gas/s across workloads at the blob target, with full blobs and no margin.
export function withDaWorkloads(ceilings: Ceiling[], workloads: DaWorkload[] = DA_WORKLOADS): Ceiling[] {
  const binding = bindingWorkload(workloads);
  const da: Ceiling = {
    area: 'da',
    value: Math.round(daCapacity(binding, BLOB_TARGET).mgasPerSecond),
    unit: 'Mgas/s',
    tag: workloads.every((w) => w.tag === 'measured') ? 'modeled' : 'estimated',
    formula: `lowest workload: ${BLOB_TARGET} blobs × ${BLOB_DATA_BYTES.toLocaleString('en-US')} B ÷ ${L1_SLOT_SECONDS} s ÷ bytes/tx × gas/tx`,
    reason: `Lowest: ${binding.label} · ${BLOB_TARGET}-blob target, no margin`,
    inputs: [],
    help: `Gas per second Ethereum's blob target carries for the workload with the most DA bytes per gas: ${BLOB_TARGET} blobs × ${BLOB_DATA_BYTES.toLocaleString('en-US')} B ÷ ${L1_SLOT_SECONDS} s ÷ bytes/tx × gas/tx, full blobs, no margin. Bytes per transaction come from running each workload's blocks through the batcher encoder (base-bench da).`,
  };
  return ceilings.map((c) => (c.area === 'da' ? da : c));
}
