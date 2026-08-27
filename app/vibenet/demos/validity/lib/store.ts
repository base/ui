import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from './constants';
import type { Deployment } from './types';

export type StoredState = {
  v: 1;
  chainId: number;
  genesisHash: string;
  userKey: Hex;
  botKeys: [Hex, Hex];
  deployment?: Deployment;
};

function isHexKey(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function parseDeployment(value: unknown): Deployment | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const d = value as Record<string, unknown>;
  if (
    !isAddress(d.tokenA) ||
    !isAddress(d.tokenB) ||
    !isAddress(d.token0) ||
    !isAddress(d.token1) ||
    !isAddress(d.factory) ||
    !isAddress(d.pair) ||
    !isAddress(d.helper)
  ) {
    return undefined;
  }
  return {
    tokenA: d.tokenA,
    tokenB: d.tokenB,
    token0: d.token0,
    token1: d.token1,
    factory: d.factory,
    pair: d.pair,
    helper: d.helper,
  };
}

export function loadState(): StoredState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parseStored(raw);
      if (parsed) return parsed;
    }
    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = window.localStorage.getItem(key);
      if (!legacy) continue;
      const migrated = parseStored(legacy);
      if (!migrated) continue;
      const next = { ...migrated, deployment: undefined };
      saveState(next);
      return next;
    }
    return null;
  } catch {
    return null;
  }
}

function parseStored(raw: string): StoredState | null {
  const parsed = JSON.parse(raw) as Partial<StoredState>;
  if (parsed.v !== 1) return null;
  if (typeof parsed.chainId !== 'number' || typeof parsed.genesisHash !== 'string') return null;
  if (!isHexKey(parsed.userKey) || !Array.isArray(parsed.botKeys)) return null;
  if (!isHexKey(parsed.botKeys[0]) || !isHexKey(parsed.botKeys[1])) return null;
  return {
    v: 1,
    chainId: parsed.chainId,
    genesisHash: parsed.genesisHash,
    userKey: parsed.userKey,
    botKeys: [parsed.botKeys[0], parsed.botKeys[1]],
    deployment: parseDeployment(parsed.deployment),
  };
}

export function saveState(state: StoredState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function dropDeployment(state: StoredState): StoredState {
  return {
    v: 1,
    chainId: state.chainId,
    genesisHash: state.genesisHash,
    userKey: state.userKey,
    botKeys: state.botKeys,
  };
}

export function createState(chainId: number, genesisHash: string): StoredState {
  return {
    v: 1,
    chainId,
    genesisHash,
    userKey: generatePrivateKey(),
    botKeys: [generatePrivateKey(), generatePrivateKey()],
  };
}

export function accountsFrom(state: StoredState) {
  return {
    user: privateKeyToAccount(state.userKey),
    bots: [privateKeyToAccount(state.botKeys[0]), privateKeyToAccount(state.botKeys[1])] as const,
  };
}
