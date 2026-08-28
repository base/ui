import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from './constants';
import type { Deployment } from './types';

export type StoredState = {
  v: 2;
  chainId: number;
  genesisHash: string;
  /** Shared account that deployed this pool (makers are its subaccounts). */
  accountId?: string;
  makerAccountIds?: [string, string];
  deployment?: Deployment;
};

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

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
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
      // Drop the pool: v1 keyed off Validity-specific EOAs that no longer exist.
      const next = dropDeployment(migrated);
      saveState(next);
      return next;
    }
    return null;
  } catch {
    return null;
  }
}

function parseMakerIds(value: unknown): [string, string] | undefined {
  if (!Array.isArray(value) || !isId(value[0]) || !isId(value[1])) return undefined;
  return [value[0], value[1]];
}

export function parseStored(raw: string): StoredState | null {
  const parsed = JSON.parse(raw) as Partial<StoredState> & { v?: number };
  if (typeof parsed.chainId !== 'number' || typeof parsed.genesisHash !== 'string') return null;
  if (parsed.v === 2) {
    return {
      v: 2,
      chainId: parsed.chainId,
      genesisHash: parsed.genesisHash,
      accountId: isId(parsed.accountId) ? parsed.accountId : undefined,
      makerAccountIds: parseMakerIds(parsed.makerAccountIds),
      deployment: parseDeployment(parsed.deployment),
    };
  }
  // v1 Validity-specific keys are not reused — keep chain identity only.
  if (parsed.v === 1) {
    return {
      v: 2,
      chainId: parsed.chainId,
      genesisHash: parsed.genesisHash,
    };
  }
  return null;
}

export function saveState(state: StoredState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function dropDeployment(state: StoredState): StoredState {
  return {
    v: 2,
    chainId: state.chainId,
    genesisHash: state.genesisHash,
    accountId: state.accountId,
    makerAccountIds: state.makerAccountIds,
  };
}

export function createState(chainId: number, genesisHash: string): StoredState {
  return { v: 2, chainId, genesisHash };
}
