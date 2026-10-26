import type { Ceiling, CeilingInput, Link } from '../snapshot.mjs';

// Ethereum's blob target and max per L1 block since BPO2 (2026-01-07), and the data one blob carries.
export const BLOB_TARGET = 14;
export const BLOB_MAX = 21;
const BLOB_DATA_BYTES = 130_044;
const L1_SLOT_SECONDS = 12;

export type DaWorkload = {
  label: string;
  benchWorkload: string;
  gasPerTx: number;
  bytesPerTx: number;
  tag: 'measured' | 'estimated';
  asOf: string | null;
  source?: Link;
};

// Bytes per transaction come from `base-bench da`; gas per transaction for bench workloads from the
// load-test calibration (etc/scripts/local/mainnet-mix.py in base/base).
export const DA_WORKLOADS: DaWorkload[] = [
  { label: 'Payments (B20 transfer)', benchWorkload: 'b20-transfer', gasPerTx: 37_743, bytesPerTx: 100, tag: 'estimated', asOf: null },
  { label: 'Swaps', benchWorkload: 'uniswap-swap', gasPerTx: 143_987, bytesPerTx: 190, tag: 'estimated', asOf: null },
  {
    label: 'Mainnet mix',
    benchWorkload: 'mainnet blocks 53,091,727–53,095,326',
    gasPerTx: 193_349,
    bytesPerTx: 154.7,
    tag: 'measured',
    asOf: '2026-10-26T02:00:00Z',
    source: { label: 'base-bench da, mainnet 2 h', url: 'https://github.com/base/base/pull/6215' },
  },
];

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
    reason: `${binding.label} bind · ${BLOB_TARGET}-blob target, full blobs, no margin`,
    inputs: workloads.map((w): CeilingInput => {
      const { mgasPerSecond, txPerSecond } = daCapacity(w, BLOB_TARGET);
      return {
        name: w.label,
        value: fmt(mgasPerSecond),
        unit: `Mgas/s · ${fmt(txPerSecond)} tx/s`,
        asOf: w.asOf,
        status: w.tag === 'measured' ? 'observed' : 'provisional',
        ...(w.source ? { source: w.source } : {}),
      };
    }),
    help: "Gas per second Ethereum's blob target carries for the workload with the most DA bytes per gas. Each workload's bytes per transaction come from running its blocks through the batcher encoder (base-bench da).",
  };
  return ceilings.map((c) => (c.area === 'da' ? da : c));
}
