import { PRESETS, presetSize, type SnapshotComponent } from './data';

const component = (name: string, size: number, tailSize?: number): SnapshotComponent => ({
  name,
  displayName: name,
  description: name,
  size,
  ...(tailSize === undefined ? {} : { tailSize }),
});

describe('presetSize', () => {
  const components = [
    component('state', 100),
    component('headers', 20, 3),
    component('transactions', 80, 8),
    component('transaction_senders', 10, 1),
    component('receipts', 70, 7),
    component('account_changesets', 60, 6),
    component('storage_changesets', 50, 5),
    component('rocksdb_indices', 40),
  ];

  it('uses all state and headers plus the final three chunks of full static-file components', () => {
    const full = PRESETS.find((preset) => preset.name === 'full')!;

    expect(presetSize(components, full)).toBe(100 + 20 + 8 + 7 + 6 + 5);
  });

  it('excludes senders and RocksDB from full', () => {
    const full = PRESETS.find((preset) => preset.name === 'full')!;

    expect(full.components).not.toContain('transaction_senders');
    expect(full.components).not.toContain('rocksdb_indices');
  });

  it('continues to use complete component sizes for archive and minimal', () => {
    const archive = PRESETS.find((preset) => preset.name === 'archive')!;
    const minimal = PRESETS.find((preset) => preset.name === 'minimal')!;

    expect(presetSize(components, archive)).toBe(430);
    expect(presetSize(components, minimal)).toBe(120);
  });

  it('falls back to the complete size when older API data has no tail size', () => {
    const full = PRESETS.find((preset) => preset.name === 'full')!;

    expect(presetSize([component('transactions', 80)], full)).toBe(80);
  });
});
