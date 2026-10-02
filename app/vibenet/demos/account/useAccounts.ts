'use client';

// Local state and persistence for the EIP-8130 account demo.

import { useCallback, useEffect, useState } from 'react';

import type { ActivityEntry, StoredAccount } from './library/model';
import { deserializeState, normalizePersistedState, serializeState } from './library/model';
import type { Persisted, WalletSigner } from './shared';

export const ACCOUNTS_STORAGE_KEY = 'vibenet.account.v2';

export function useAccounts() {
  const [signers, setSigners] = useState<WalletSigner[]>([]);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [networkShort, setNetworkShort] = useState<string>('vibenet');
  const [genesisHash, setGenesisHash] = useState<string | null>(null);

  // State, rather than a ref, ensures the first save effect does not overwrite
  // storage before the load effect has committed (including in StrictMode).
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (raw) {
        const s = deserializeState<Partial<Persisted>>(raw);
        // Records written before the Keystore was disabled (smart accounts,
        // sub-accounts, passkeys) are dropped here; the next save rewrites them.
        const normalized = normalizePersistedState(s);
        setSigners(normalized.signers);
        setAccounts(normalized.accounts);
        setActiveAccountId(normalized.activeAccountId);
        setActivity(normalized.activity);
        setGenesisHash(s.genesisHash ?? null);
        if (s.network) setNetworkShort(s.network);
      }
    } catch {
      /* ignore corrupt state */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        ACCOUNTS_STORAGE_KEY,
        serializeState<Persisted>({
          signers,
          accounts,
          activeAccountId,
          activity,
          network: networkShort,
          genesisHash: genesisHash ?? undefined,
        }),
      );
    } catch {
      /* quota / unavailable */
    }
  }, [hydrated, signers, accounts, activeAccountId, activity, networkShort, genesisHash]);

  const addAccount = useCallback((a: StoredAccount) => {
    setAccounts((prev) => [...prev, a]);
    setActiveAccountId(a.id);
  }, []);

  const deleteAccount = useCallback(
    (id: string) => {
      const next = accounts.filter((a) => a.id !== id);
      setAccounts(next);
      if (activeAccountId === id) setActiveAccountId(next[0]?.id ?? null);
    },
    [accounts, activeAccountId],
  );

  return {
    signers,
    setSigners,
    accounts,
    setAccounts,
    activeAccountId,
    setActiveAccountId,
    activity,
    setActivity,
    networkShort,
    setNetworkShort,
    genesisHash,
    setGenesisHash,
    hydrated,
    addAccount,
    deleteAccount,
  };
}
