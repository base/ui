import { STORAGE_KEY } from './constants';
import type { Deployment, PlacedOrder, Rectangle, ValidityPredicate } from './types';

export const MAX_STORED_ORDERS = 40;

export type StoredState = {
  v: 2;
  chainId: number;
  genesisHash: string;
  deployment?: Deployment;
  orders?: PlacedOrder[];
};

function bnReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? { $bn: value.toString() } : value;
}

function bnReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '$bn' in value) {
    try {
      return BigInt((value as { $bn: string }).$bn);
    } catch {
      return value;
    }
  }
  return value;
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
    !isAddress(d.helper) ||
    !isAddress(d.minter)
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
    minter: d.minter,
  };
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function asBigint(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseRectangle(value: unknown): Rectangle | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const r0Min = asBigint(row.r0Min);
  const r0Max = asBigint(row.r0Max);
  const r1Min = asBigint(row.r1Min);
  const r1Max = asBigint(row.r1Max);
  if (r0Min === undefined || r0Max === undefined || r1Min === undefined || r1Max === undefined) {
    return undefined;
  }
  if (row.side !== 'buy' && row.side !== 'sell') return undefined;
  return { r0Min, r0Max, r1Min, r1Max, side: row.side };
}

function parseOrder(value: unknown): PlacedOrder | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const targetPriceWad = asBigint(row.targetPriceWad);
  const size = asBigint(row.size);
  const rectangle = parseRectangle(row.rectangle);
  if (!isId(row.id) || targetPriceWad === undefined || size === undefined || !rectangle) return undefined;
  if (row.side !== 'buy' && row.side !== 'sell') return undefined;
  if (
    row.status !== 'pending' &&
    row.status !== 'filled' &&
    row.status !== 'expired' &&
    row.status !== 'replaced' &&
    row.status !== 'error'
  ) {
    return undefined;
  }
  if (typeof row.submittedAt !== 'number' || typeof row.expirySeconds !== 'number') return undefined;
  const validity = Array.isArray(row.validity) ? (row.validity as ValidityPredicate[]) : [];
  const order: PlacedOrder = {
    id: row.id,
    side: row.side,
    targetPriceWad,
    size,
    expirySeconds: row.expirySeconds,
    submittedAt: row.submittedAt,
    status: row.status,
    rectangle,
    validity,
  };
  if (row.submitMode === 'replace' || row.submitMode === 'concurrent') order.submitMode = row.submitMode;
  if (typeof row.delaySeconds === 'number') order.delaySeconds = row.delaySeconds;
  const maxBlock = asBigint(row.maxBlock);
  if (maxBlock !== undefined) order.maxBlock = maxBlock;
  const minBlock = asBigint(row.minBlock);
  if (minBlock !== undefined) order.minBlock = minBlock;
  if (typeof row.txHash === 'string' && /^0x[0-9a-fA-F]+$/.test(row.txHash)) {
    order.txHash = row.txHash as PlacedOrder['txHash'];
  }
  if (typeof row.nonce === 'number') order.nonce = row.nonce;
  const maxFeePerGas = asBigint(row.maxFeePerGas);
  if (maxFeePerGas !== undefined) order.maxFeePerGas = maxFeePerGas;
  const maxPriorityFeePerGas = asBigint(row.maxPriorityFeePerGas);
  if (maxPriorityFeePerGas !== undefined) order.maxPriorityFeePerGas = maxPriorityFeePerGas;
  if (typeof row.error === 'string') order.error = row.error;
  if (typeof row.filledAt === 'number') order.filledAt = row.filledAt;
  const fillPriceWad = asBigint(row.fillPriceWad);
  if (fillPriceWad !== undefined) order.fillPriceWad = fillPriceWad;
  return order;
}

export function parseOrders(value: unknown): PlacedOrder[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const orders: PlacedOrder[] = [];
  for (const row of value) {
    const order = parseOrder(row);
    if (order) orders.push(order);
    if (orders.length >= MAX_STORED_ORDERS) break;
  }
  return orders;
}

export function loadState(): StoredState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseStored(raw) : null;
  } catch {
    return null;
  }
}

export function parseStored(raw: string): StoredState | null {
  const parsed = JSON.parse(raw, bnReviver) as Partial<StoredState> & { v?: number };
  if (typeof parsed.chainId !== 'number' || typeof parsed.genesisHash !== 'string') return null;
  if (parsed.v !== 2) return null;
  return {
    v: 2,
    chainId: parsed.chainId,
    genesisHash: parsed.genesisHash,
    deployment: parseDeployment(parsed.deployment),
    orders: parseOrders(parsed.orders),
  };
}

export function saveState(state: StoredState): void {
  const orders = state.orders?.slice(0, MAX_STORED_ORDERS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, orders }, bnReplacer));
}

export function createState(chainId: number, genesisHash: string): StoredState {
  return { v: 2, chainId, genesisHash };
}
