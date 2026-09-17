import {
  applyComponentDependencies,
  buildDownloadCommand,
  PRESETS,
  presetSize,
  type SnapshotComponent,
} from './data';

const component = (name: string, size: number, fullSize?: number): SnapshotComponent => ({
  name,
  displayName: name,
  description: name,
  size,
  ...(fullSize === undefined ? {} : { fullSize }),
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
    component('proofs', 25),
  ];

  it('uses all state and headers plus the history window of full static-file components', () => {
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

  it('adds the proofs component to the complete archive size', () => {
    const archiveWithProofs = PRESETS.find((preset) => preset.name === 'archive-proofs')!;

    expect(presetSize(components, archiveWithProofs)).toBe(455);
  });

  it('falls back to the complete size when older API data has no tail size', () => {
    const full = PRESETS.find((preset) => preset.name === 'full')!;

    expect(presetSize([component('transactions', 80)], full)).toBe(80);
  });
});

describe('proofs configuration', () => {
  const archive = PRESETS.find((preset) => preset.name === 'archive')!;
  const archiveWithProofs = PRESETS.find((preset) => preset.name === 'archive-proofs')!;

  it('builds the archive and proofs command from a custom selection', () => {
    expect(buildDownloadCommand('base', null, archiveWithProofs.components)).toBe(
      'base-reth-node download --chain base --archive --proofs',
    );
  });

  it('builds the same command when the Archive + Proofs preset is selected', () => {
    expect(buildDownloadCommand('base', 'archive-proofs', archiveWithProofs.components)).toBe(
      'base-reth-node download --chain base --archive --proofs',
    );
  });

  it('removes proofs when any archive component is removed', () => {
    const withoutReceipts = archiveWithProofs.components.filter(
      (component) => component !== 'receipts',
    );

    expect(applyComponentDependencies(withoutReceipts)).not.toContain('proofs');
    expect(applyComponentDependencies(archive.components)).toEqual(archive.components);
  });
});
