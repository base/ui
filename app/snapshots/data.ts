// Shared types, presets, formatting, and sample data for the Snapshots surface.
// Plain TS (no React) so both the API route and the client page can import it.

export type SnapshotComponent = {
  name: string;
  displayName: string;
  description: string;
  size: number; // bytes
};

export type Snapshot = {
  chainId: string;
  chainName: string;
  network: string; // "mainnet" | "sepolia" | "zeronet"
  block: number;
  timestamp: string;
  date: string;
  rethVersion: string;
  image?: string;
  profile: string;
  channel?: string;
  size: number; // total bytes
  isModular: true;
  components: SnapshotComponent[];
  archiveUrl?: string;
  archiveFile?: string;
  metadataUrl?: string;
  manifestUrl: string;
};

export type PresetName = 'minimal' | 'full' | 'archive';

export type Preset = {
  name: PresetName;
  displayName: string;
  description: string;
  components: string[];
  capabilities: string[];
};

export const PRESETS: Preset[] = [
  {
    name: 'minimal',
    displayName: 'Minimal',
    description: 'State and headers only. Smallest download for validators and light usage.',
    components: ['state', 'headers'],
    capabilities: ['Sync', 'Validate'],
  },
  {
    name: 'full',
    displayName: 'Full',
    description: 'Adds transactions and senders. Suitable for dApp backends and general RPC.',
    components: ['state', 'headers', 'transactions', 'transaction_senders'],
    capabilities: ['Sync', 'Validate', 'Query', 'Trace'],
  },
  {
    name: 'archive',
    displayName: 'Archive',
    description: 'Everything included. Full historical data for indexers and RPC providers.',
    components: [
      'state',
      'headers',
      'transactions',
      'transaction_senders',
      'receipts',
      'account_changesets',
      'storage_changesets',
      'rocksdb_indices',
    ],
    capabilities: ['Sync', 'Validate', 'Query', 'Trace', 'Debug', 'Index'],
  },
];

export const CHAIN_NAME_BY_NETWORK: Record<string, string> = {
  mainnet: 'base-mainnet',
  sepolia: 'base-sepolia',
  zeronet: 'base-zeronet',
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1000;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function formatNumber(n: number): string {
  // Use the runtime's default locale rather than a hardcoded one; the app has
  // no i18n provider, so there is no locale context to source from.
  return new Intl.NumberFormat().format(n);
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// --- Sample data (rendered locally when R2 credentials are not configured) ---

const GB = 1e9;

export const COMPONENT_META: Record<string, { displayName: string; description: string }> = {
  state: { displayName: 'State (mdbx)', description: 'Account and storage trie state database' },
  headers: { displayName: 'Headers', description: 'Block headers for chain history' },
  transactions: { displayName: 'Transactions', description: 'Full transaction data' },
  transaction_senders: {
    displayName: 'Senders',
    description: 'Recovered transaction sender addresses',
  },
  receipts: { displayName: 'Receipts', description: 'Transaction receipts with logs and status' },
  account_changesets: {
    displayName: 'Account Changesets',
    description: 'Historical account state changes',
  },
  storage_changesets: {
    displayName: 'Storage Changesets',
    description: 'Historical storage slot changes',
  },
  rocksdb_indices: { displayName: 'Indices', description: 'Database indices for fast lookups' },
};

export const COMPONENT_ORDER = Object.keys(COMPONENT_META);

function buildComponents(sizesGB: Record<string, number>): SnapshotComponent[] {
  return COMPONENT_ORDER.map((name) => ({
    name,
    ...COMPONENT_META[name],
    size: (sizesGB[name] ?? 0) * GB,
  }));
}

function sampleSnapshot(
  network: string,
  chainName: string,
  chainId: string,
  block: number,
  sizesGB: Record<string, number>,
): Snapshot {
  const components = buildComponents(sizesGB);
  return {
    chainId,
    chainName,
    network,
    block,
    timestamp: '1783555200',
    date: '2026-07-08',
    rethVersion: 'reth v2.1.0',
    image: 'reth v2.1.0',
    profile: 'archive',
    size: components.reduce((sum, c) => sum + c.size, 0),
    isModular: true,
    components,
    manifestUrl: `https://${network}-v2-snapshots.base.org/${block}/manifest.json`,
  };
}

export const SAMPLE_SNAPSHOTS: Snapshot[] = [
  sampleSnapshot('mainnet', 'Base Mainnet', '8453', 34200000, {
    state: 900,
    headers: 9,
    transactions: 420,
    transaction_senders: 55,
    receipts: 520,
    account_changesets: 310,
    storage_changesets: 680,
    rocksdb_indices: 240,
  }),
  sampleSnapshot('sepolia', 'Base Sepolia', '84532', 19800000, {
    state: 140,
    headers: 3,
    transactions: 60,
    transaction_senders: 9,
    receipts: 70,
    account_changesets: 40,
    storage_changesets: 90,
    rocksdb_indices: 35,
  }),
  sampleSnapshot('zeronet', 'Base Zeronet', '84530', 512000, {
    state: 12,
    headers: 1,
    transactions: 3,
    transaction_senders: 1,
    receipts: 4,
    account_changesets: 2,
    storage_changesets: 5,
    rocksdb_indices: 2,
  }),
];
