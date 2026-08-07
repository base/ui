import type { Address } from 'viem';

import { CHAIN_ID, STORAGE_KEY } from './constants';
import type { RecentToken } from './types';

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
