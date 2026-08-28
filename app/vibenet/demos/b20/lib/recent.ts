import type { Address } from 'viem';

import { CHAIN_ID, POLICY_STORAGE_KEY, STORAGE_KEY } from './constants';
import type { RecentPolicy, RecentToken } from './types';

// Tokens are global registry entries, not wallet-owned objects — every local
// account sees every deployed token. What a wallet can *do* to a token (assign
// policies, publish announcements) is separately gated by that token's on-chain
// admin/operator roles, which are only ever granted to its creator. Read the
// chain-wide list plus legacy per-wallet keys written by earlier builds.
export function readRecent(wallet: Address | null): RecentToken[] {
  if (!wallet || typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, RecentToken[]>;
    const seen = new Set<string>();
    return Object.entries(stored)
      .filter(([key]) => key === String(CHAIN_ID) || key.startsWith(`${CHAIN_ID}:`))
      .flatMap(([, tokens]) => tokens)
      .filter((token) => {
        const address = token.address.toLowerCase();
        if (seen.has(address)) return false;
        seen.add(address);
        return true;
      })
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function writeRecent(wallet: Address, token: RecentToken): RecentToken[] {
  const stored =
    typeof window === 'undefined'
      ? {}
      : (JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, RecentToken[]>);
  const key = String(CHAIN_ID);
  const next = [
    token,
    ...(stored[key] ?? []).filter((entry) => entry.address.toLowerCase() !== token.address.toLowerCase()),
  ].slice(0, 8);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [key]: next }));
  return readRecent(wallet);
}

export function removeRecent(wallet: Address, address: Address): RecentToken[] {
  if (typeof window === 'undefined') return [];
  const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, RecentToken[]>;
  const next = Object.fromEntries(
    Object.entries(stored).map(([key, tokens]) => [
      key,
      key === String(CHAIN_ID) || key.startsWith(`${CHAIN_ID}:`)
        ? tokens.filter((entry) => entry.address.toLowerCase() !== address.toLowerCase())
        : tokens,
    ]),
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return readRecent(wallet);
}

type StoredPolicy = Omit<RecentPolicy, 'id' | 'childPolicyIds'> & { id: string; childPolicyIds?: string[] };

// Forget a policy locally. The on-chain policy still exists in the registry —
// this only drops it from the browser's recent list (used by the "delete"
// affordance in the Policies dropdown).
export function removeRecentPolicy(wallet: Address | null, id: bigint): RecentPolicy[] {
  if (typeof window === 'undefined') return wallet ? readRecentPolicies(wallet) : [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(POLICY_STORAGE_KEY) ?? '{}') as Record<string, StoredPolicy[]>;
    const target = id.toString();
    const next = Object.fromEntries(
      Object.entries(stored).map(([key, policies]) => [
        key,
        key === String(CHAIN_ID) || key.startsWith(`${CHAIN_ID}:`)
          ? policies.filter((policy) => policy.id !== target)
          : policies,
      ]),
    );
    window.localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Nothing persisted — the recomputed list below is authoritative for the session.
  }
  return wallet ? readRecentPolicies(wallet) : [];
}

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
