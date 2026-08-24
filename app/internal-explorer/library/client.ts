// Chain-aware fetch client for the Internal Explorer API.
//
// The API lives at /api/internal-explorer/* (same-origin route handlers) and is
// chain-aware: every request carries the currently selected chain as
// `?chain=<id>`. Callers pass the resolved TipsChain from useTipsChain().

import { TIPS_API_PATH } from '../flag';
import type { TipsChain } from '../chains';
import type {
  BlockDetailResponse,
  BlocksResponse,
  BundleHistoryResponse,
  RejectedTransactionsResponse,
  TransactionHistoryResponse,
  TransactionsResponse,
} from './types';

/** Thrown when the API responds with a non-2xx status. */
export class TipsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TipsApiError';
    this.status = status;
  }
}

const enc = encodeURIComponent;

// Append `chain` to the path's query string (handles paths that already carry
// a `?`), then fetch with no caching so live data never goes stale.
async function get<T>(path: string, chain: TipsChain, signal?: AbortSignal): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${path}${separator}chain=${chain}`, {
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new TipsApiError(
      `Internal Explorer API request to ${path} failed (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

// Typed endpoint helpers. Each takes the active chain so the caller never has to
// remember to thread `?chain=` through by hand.
export const tipsApi = {
  blocks: (chain: TipsChain, signal?: AbortSignal) =>
    get<BlocksResponse>(`${TIPS_API_PATH}/blocks`, chain, signal),
  blocksPage: (
    chain: TipsChain,
    options?: { cursor?: number; limit?: number },
    signal?: AbortSignal,
  ) =>
    get<BlocksResponse>(
      withQuery(`${TIPS_API_PATH}/blocks`, { cursor: options?.cursor, limit: options?.limit }),
      chain,
      signal,
    ),
  txs: (
    chain: TipsChain,
    options?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ) =>
    get<TransactionsResponse>(
      withQuery(`${TIPS_API_PATH}/txs`, { cursor: options?.cursor, limit: options?.limit }),
      chain,
      signal,
    ),
  block: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<BlockDetailResponse>(`${TIPS_API_PATH}/block/${enc(hash)}`, chain, signal),
  txn: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<TransactionHistoryResponse>(`${TIPS_API_PATH}/txn/${enc(hash)}`, chain, signal),
  rejected: (chain: TipsChain, signal?: AbortSignal) =>
    get<RejectedTransactionsResponse>(`${TIPS_API_PATH}/rejected`, chain, signal),
  bundle: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<BundleHistoryResponse>(`${TIPS_API_PATH}/bundle/${enc(hash)}`, chain, signal),
};
