import type { Change, ChangeCategory, Lifecycle, LifecycleState, UpgradeStatus } from './types';

export type StatusVariant = LifecycleState | 'draft' | 'accepted';

export const UPGRADE_NETWORKS = ['sepolia', 'mainnet'] as const satisfies (keyof Lifecycle)[];

export const CATEGORY_ORDER = [
  'execution',
  'networking',
  'flashblocks',
  'rpc',
  'proofs',
  'wallet',
  'bridging',
  'precompile',
] as const satisfies ChangeCategory[];

export const CATEGORY_METADATA = {
  execution: {
    label: 'Execution',
    className:
      'border-bds-blue-20 bg-bds-blue-0 text-bds-blue-70 dark:border-bds-blue-80 dark:bg-bds-blue-100 dark:text-bds-blue-15',
    accentClassName: 'bg-bds-blue-50',
  },
  proofs: {
    label: 'Proofs',
    className:
      'border-bds-pink-20 bg-bds-pink-0 text-bds-pink-70 dark:border-bds-pink-80 dark:bg-bds-pink-100 dark:text-bds-pink-15',
    accentClassName: 'bg-bds-pink-40',
  },
  wallet: {
    label: 'Wallet',
    className:
      'border-bds-teal-20 bg-bds-teal-0 text-bds-teal-70 dark:border-bds-teal-80 dark:bg-bds-teal-100 dark:text-bds-teal-15',
    accentClassName: 'bg-bds-teal-40',
  },
  flashblocks: {
    label: 'Flashblocks',
    className:
      'border-bds-yellow-20 bg-bds-yellow-0 text-bds-yellow-80 dark:border-bds-yellow-80 dark:bg-bds-yellow-100 dark:text-bds-yellow-15',
    accentClassName: 'bg-bds-yellow-40',
  },
  rpc: {
    label: 'RPC',
    className:
      'border-bds-chartreuse-20 bg-bds-chartreuse-0 text-bds-chartreuse-80 dark:border-bds-chartreuse-80 dark:bg-bds-chartreuse-100 dark:text-bds-chartreuse-15',
    accentClassName: 'bg-bds-chartreuse-40',
  },
  networking: {
    label: 'Networking',
    className:
      'border-bds-orange-20 bg-bds-orange-0 text-bds-orange-80 dark:border-bds-orange-80 dark:bg-bds-orange-100 dark:text-bds-orange-15',
    accentClassName: 'bg-bds-orange-40',
  },
  precompile: {
    label: 'Precompile',
    className:
      'border-bds-orange-20 bg-bds-orange-0 text-bds-orange-80 dark:border-bds-orange-80 dark:bg-bds-orange-100 dark:text-bds-orange-15',
    accentClassName: 'bg-bds-orange-40',
  },
  bridging: {
    label: 'Bridging',
    className:
      'border-bds-yellow-20 bg-bds-yellow-0 text-bds-yellow-80 dark:border-bds-yellow-80 dark:bg-bds-yellow-100 dark:text-bds-yellow-15',
    accentClassName: 'bg-bds-yellow-40',
  },
} as const satisfies Record<
  ChangeCategory,
  { label: string; className: string; accentClassName: string }
>;

export const UPGRADE_STATUS_METADATA = {
  live: { label: 'Live', detailLabel: 'Live', variant: 'live' },
  shipping: {
    label: 'Shipping',
    detailLabel: 'Shipping to Mainnet',
    variant: 'scheduled',
  },
  scheduled: { label: 'Scheduled', detailLabel: 'Scheduled', variant: 'scheduled' },
  planning: { label: 'Planning', detailLabel: 'Planning', variant: 'planning' },
} as const satisfies Record<
  UpgradeStatus,
  { label: string; detailLabel: string; variant: StatusVariant }
>;

export const LIFECYCLE_LABELS = {
  live: 'Live',
  scheduled: 'Scheduled',
  planning: 'Planning',
} as const satisfies Record<LifecycleState, string>;

export const NETWORK_LABELS = {
  sepolia: 'Sepolia',
  mainnet: 'Mainnet',
} as const satisfies Record<keyof Lifecycle, string>;

export function changeRefs(change: Change): string[] {
  if (change.kind === 'eip') {
    return [...change.relatedEips];
  }
  return [];
}

/**
 * The human-readable title shown in the UI. EIP changes are prefixed with their
 * uppercased id (e.g. "EIP-7823: Upper-Bound MODEXP") so the prefix must be part
 * of anything that matches against what the user actually sees (e.g. search).
 */
export function changeDisplayTitle(change: Change): string {
  if (change.kind === 'eip') {
    return `${change.id.toUpperCase()}: ${change.title}`;
  }
  return change.title;
}

export function kindLabel(kind: Change['kind']): string {
  switch (kind) {
    case 'eip':
      return 'EIP';
    case 'base':
      return 'Base';
    default:
      return 'Base';
  }
}
