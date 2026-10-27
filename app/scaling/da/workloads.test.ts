import { expect, it } from 'vitest';

import type { Ceiling } from '../snapshot.mjs';
import type { Da, Run } from '../proven/capacity';
import { BLOB_MAX, BLOB_TARGET, daCapacity, daWorkloads, DA_WORKLOADS, withDaWorkloads, type DaWorkload } from './workloads';

const ceiling = (area: Ceiling['area'], value: number): Ceiling => ({
  area, value, unit: 'Mgas/s', tag: 'modeled', formula: 'snapshot', inputs: [], help: 'snapshot',
});
const workload = (label: string, bytesPerTx: number, gasPerTx: number, tag: DaWorkload['tag']): DaWorkload => ({
  label, payload: 'mix', benchWorkload: label, bytesPerTx, gasPerTx, tag, asOf: null,
});

it('turns bytes per transaction into tx/s and gas/s at a blob count', () => {
  // 14 blobs × 130,044 B ÷ 12 s = 151,718 B/s; at 100 B and 37,743 gas per tx.
  const target = daCapacity(workload('payments', 100, 37_743, 'estimated'), BLOB_TARGET);
  expect(Math.round(target.txPerSecond)).toBe(1_517);
  expect(target.mgasPerSecond).toBeCloseTo(57.26, 2);
  expect(daCapacity(workload('payments', 100, 37_743, 'estimated'), BLOB_MAX).mgasPerSecond).toBeCloseTo(1.5 * target.mgasPerSecond);
});

it('replaces only the DA ceiling, with the lowest workload gas/s', () => {
  const workloads = [workload('mix', 155, 193_000, 'measured'), workload('payments', 100, 37_743, 'estimated')];
  const [da, execution] = withDaWorkloads([ceiling('da', 820), ceiling('execution', 400)], workloads);

  expect(execution).toEqual(ceiling('execution', 400));
  expect(da.value).toBe(57);
  expect(da.tag).toBe('estimated');
  expect(da.reason).toBe('Lowest: payments · 14-blob target, no margin');
});

it('is modeled once every workload is measured', () => {
  const [da] = withDaWorkloads([ceiling('da', 820)], [workload('mix', 155, 193_000, 'measured')]);
  expect(da.tag).toBe('modeled');
});

const run = (workload: Run['workload'], da: Run['da']): Run => ({
  id: `synthetic-${workload}`, outputDir: `synthetic-${workload}`, workload, mgas: 200, gps: 2e8, tps: 4000, reverted: 0, storage: null, passed: true,
  commit: 'c0ffee', createdAt: Date.parse('2026-01-05T00:00:00Z'), steps: [], replay: null, proofNode: null, da,
});
const da = (frame_bytes: number, gas_used: number, transactions: number): Da => ({
  result: { seconds: 600, gas_used, transactions, transaction_bytes: 0, frame_bytes, gas_per_second: 0, bytes_per_gas: frame_bytes / gas_used, compression_ratio: 0, blobs_per_l1_slot: 15.5, blob_fill: 1, blob_target_gas_per_second: 0 },
  target: 14,
  withinTarget: false,
});

it('measures bytes/tx and gas/tx from a bench DA run, keeping the mainnet mix and estimates without one', () => {
  const payment = run('payment', da(8e7, 4e10, 1e6));
  const [payments, swaps, mix] = daWorkloads({ payment, swap: run('swap', null), mix: run('mix', da(1, 1, 1)) });
  expect(payments).toMatchObject({
    bytesPerTx: 80, gasPerTx: 40_000, tag: 'measured', asOf: '2026-01-05T00:00:00.000Z',
    source: { label: 'bench 200 Mgas/s run', url: '/scaling/runs/bench/synthetic-payment' }, bench: { run: payment },
  });
  // bytes/tx ÷ gas/tx is the run's frame bytes per gas, so the 14-blob formula matches the run's own.
  expect(daCapacity(payments, BLOB_TARGET).mgasPerSecond).toBeCloseTo((14 * 130_044) / 12 / payment.da!.result.bytes_per_gas / 1e6);
  expect(swaps).toBe(DA_WORKLOADS[1]);
  expect(mix).toMatchObject({ bytesPerTx: DA_WORKLOADS[2].bytesPerTx, tag: 'measured', bench: { da: { withinTarget: false } } });
  expect(daWorkloads(undefined)).toEqual(DA_WORKLOADS);
});

it('counts only successful transactions per second, keeping gas per second', () => {
  const swap = { ...run('swap', da(1.58e8, 2.4e11, 2e6)), reverted: 0.155 };
  const [, swaps] = daWorkloads({ payment: null, swap, mix: null });
  // 2,000,000 × 0.845 = 1,690,000 successful transactions carry all the bytes and gas.
  expect(swaps.gasPerTx).toBeCloseTo(2.4e11 / 1.69e6);
  expect(swaps.bytesPerTx).toBeCloseTo(1.58e8 / 1.69e6);
  const allTx = daWorkloads({ payment: null, swap: { ...swap, reverted: 0 }, mix: null })[1];
  expect(daCapacity(swaps, BLOB_TARGET).txPerSecond).toBeCloseTo(0.845 * daCapacity(allTx, BLOB_TARGET).txPerSecond);
  expect(daCapacity(swaps, BLOB_TARGET).mgasPerSecond).toBeCloseTo(daCapacity(allTx, BLOB_TARGET).mgasPerSecond);
});

it('is modeled once payments and swaps are measured', () => {
  const [da2] = withDaWorkloads([ceiling('da', 820)], daWorkloads({ payment: run('payment', da(8e7, 4e10, 1e6)), swap: run('swap', da(2e8, 1.4e11, 1e6)), mix: null }));
  expect(da2.tag).toBe('modeled');
});
