import type { Address } from 'viem';

import { CHAIN_ID, POLICY_STORAGE_KEY, STORAGE_KEY } from './constants';
import type { RecentPolicy, RecentToken } from './types';

// Per-wallet list of recently deployed B20 tokens, persisted to localStorage so
// the Policy Viewer can offer them as quick-inspect shortcuts.
export function readRecent(wallet: Address | null): RecentToken[] {
  if (!wallet || typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, RecentToken[]>;
    return stored[`${CHAIN_ID}:${wallet.toLowerCase()}`] ?? [];
  } catch {
    return [];
  }
}

export function writeRecent(wallet: Address, token: RecentToken): RecentToken[] {
  const stored =
    typeof window === 'undefined'
      ? {}
      : (JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, RecentToken[]>);
  const key = `${CHAIN_ID}:${wallet.toLowerCase()}`;
  const next = [
    token,
    ...(stored[key] ?? []).filter((entry) => entry.address.toLowerCase() !== token.address.toLowerCase()),
  ].slice(0, 8);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [key]: next }));
  return next;
}

type StoredPolicy = Omit<RecentPolicy, 'id' | 'childPolicyIds'> & { id: string; childPolicyIds?: string[] };

export function readRecentPolicies(wallet: Address | null): RecentPolicy[] {
  if (!wallet || typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(POLICY_STORAGE_KEY) ?? '{}') as Record<
      string,
      StoredPolicy[]
    >;
    // Policies are global registry entries, not wallet-owned objects. Read the
    // chain-wide history plus legacy per-wallet keys written by earlier builds.
    const rows = Object.entries(stored)
      .filter(([key]) => key === String(CHAIN_ID) || key.startsWith(`${CHAIN_ID}:`))
      .flatMap(([, policies]) => policies);
    const seen = new Set<string>();
    return rows.flatMap((policy) => {
      try {
        if (seen.has(policy.id)) return [];
        seen.add(policy.id);
        return [{
          ...policy,
          id: BigInt(policy.id),
          ...(policy.childPolicyIds ? { childPolicyIds: policy.childPolicyIds.map(BigInt) } : {}),
        } as RecentPolicy];
      } catch {
        return [];
      }
    }).slice(0, 8);
  } catch {
    return [];
  }
}

export function writeRecentPolicy(wallet: Address, policy: RecentPolicy): RecentPolicy[] {
  const current = readRecentPolicies(wallet);
  // Copy only the reusable summary fields. Callers may pass a richer creation
  // result containing the initial member addresses, which do not need to be
  // retained in browser storage.
  const summary = {
    id: policy.id,
    kind: policy.kind,
    ...(policy.label ? { label: policy.label } : {}),
    admin: policy.admin,
    hash: policy.hash,
    ...('memberCount' in policy ? { memberCount: policy.memberCount } : { childPolicyIds: policy.childPolicyIds }),
  } as RecentPolicy;
  const next = [summary, ...current.filter((entry) => entry.id !== policy.id)].slice(0, 8);
  if (typeof window === 'undefined') return next;
  try {
    const stored = JSON.parse(window.localStorage.getItem(POLICY_STORAGE_KEY) ?? '{}') as Record<
      string,
      StoredPolicy[]
    >;
    const key = String(CHAIN_ID);
    window.localStorage.setItem(
      POLICY_STORAGE_KEY,
      JSON.stringify({
        ...stored,
        [key]: next.map((entry) => ({
          ...entry,
          id: entry.id.toString(),
          ...('childPolicyIds' in entry ? { childPolicyIds: entry.childPolicyIds.map(String) } : {}),
        })),
      }),
    );
  } catch {
    // The on-chain policy remains valid even when browser persistence is unavailable.
  }
  return next;
}
