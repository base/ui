'use client';

// Live lookup from an address to the label of a known local account. Names come
// from the account demo's localStorage, so an address you created there is
// recognised anywhere across Vibenet (explorer, faucet, …).

import { useEffect, useState } from 'react';

import { deserializeState } from '../demos/account/library/model';
import type { Persisted } from '../demos/account/shared';
import { ACCOUNTS_STORAGE_KEY } from '../demos/account/useAccounts';

/** address (lowercased) -> account label, read from the persisted account store. */
export function readAccountNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return {};
    const state = deserializeState<Persisted>(raw);
    const map: Record<string, string> = {};
    for (const account of state.accounts ?? []) {
      map[account.address.toLowerCase()] = account.label;
      for (const sub of account.subAccounts ?? []) {
        map[sub.address.toLowerCase()] = sub.label;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Live map of known local-account addresses to their labels. Empty on the first
 * render (so server and client markup match, avoiding a hydration mismatch) and
 * filled in after mount; refreshes when another tab writes the account store.
 */
export function useAccountNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setNames(readAccountNames());
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACCOUNTS_STORAGE_KEY) setNames(readAccountNames());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return names;
}
