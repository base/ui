import type { Address, Hex } from 'viem';

export type Module = 'policy' | 'memos' | 'announcements' | 'deploy';
export type TokenAccess = 'sample' | 'operator' | 'external' | 'disconnected';

export type RecentToken = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  variant: 'asset' | 'stablecoin';
};

export type TokenInfo = RecentToken & {
  supply: bigint;
  cap: bigint;
  contractURI: string;
  policies: Array<{ scope: string; label: string; id: bigint; exists: boolean; admin: Address }>;
};

export type ActivityItem = { label: string; hash?: Hex; state: 'success' | 'error' | 'pending'; detail?: string };

export type CreatedToken = RecentToken & { hash: Hex; configured: string[] };
