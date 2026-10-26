import { expect, it } from 'vitest';

import type { Ceiling } from '../snapshot.mjs';
import { BLOB_MAX, BLOB_TARGET, daCapacity, withDaWorkloads, type DaWorkload } from './workloads';

const ceiling = (area: Ceiling['area'], value: number): Ceiling => ({
  area, value, unit: 'Mgas/s', tag: 'modeled', formula: 'snapshot', inputs: [], help: 'snapshot',
});
const workload = (label: string, bytesPerTx: number, gasPerTx: number, tag: DaWorkload['tag']): DaWorkload => ({
  label, benchWorkload: label, bytesPerTx, gasPerTx, tag, asOf: null,
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
  expect(da.reason).toContain('payments bind');
  expect(da.inputs.map((i) => [i.name, i.value, i.status])).toEqual([['mix', '189', 'observed'], ['payments', '57', 'provisional']]);
});

it('is modeled once every workload is measured', () => {
  const [da] = withDaWorkloads([ceiling('da', 820)], [workload('mix', 155, 193_000, 'measured')]);
  expect(da.tag).toBe('modeled');
});
