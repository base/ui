import type { Address, Hex } from 'viem';

export type Module = 'policy' | 'memos' | 'announcements' | 'deploy';
export type TokenAccess = 'sample' | 'operator' | 'external' | 'disconnected';
export type SimplePolicyKind = 'allowlist' | 'blocklist';
export type CompositePolicyKind = 'union' | 'intersect';
export type PolicyKind = SimplePolicyKind | CompositePolicyKind;

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
  policies: Array<{ scope: string; label: string; id: bigint; exists: boolean; admin: Address }>;
};

export type ActivityItem = { label: string; hash?: Hex; state: 'success' | 'error' | 'pending'; detail?: string };

export type CreatedToken = RecentToken & { hash: Hex; configured: string[] };

type PolicySummary = {
  id: bigint;
  kind: PolicyKind;
  label?: string;
  admin: Address;
  hash: Hex;
};

export type RecentSimplePolicy = PolicySummary & {
  kind: SimplePolicyKind;
  memberCount: number;
};

export type RecentCompositePolicy = PolicySummary & {
  kind: CompositePolicyKind;
  childPolicyIds: bigint[];
};

export type RecentPolicy = RecentSimplePolicy | RecentCompositePolicy;
export type CreatedPolicy = (RecentSimplePolicy & { members: Address[] }) | RecentCompositePolicy;
