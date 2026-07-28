// Chain-aware fetch client for the TIPS API.
//
// The API lives at /api/tips/* (same-origin route handlers, owned by another
// agent) and is chain-aware: every request carries the currently selected chain
// as `?chain=<id>`. Callers pass the resolved TipsChain from useTipsChain().

import type { TipsChain } from '../chains';
import type {
  BlockDetailResponse,
  BlocksResponse,
  BundleHistoryResponse,
  RejectedTransactionsResponse,
  TransactionHistoryResponse,
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
      `TIPS API request to ${path} failed (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

// Typed endpoint helpers. Each takes the active chain so the caller never has to
// remember to thread `?chain=` through by hand.
export const tipsApi = {
  blocks: (chain: TipsChain, signal?: AbortSignal) =>
    get<BlocksResponse>('/api/tips/blocks', chain, signal),
  block: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<BlockDetailResponse>(`/api/tips/block/${enc(hash)}`, chain, signal),
  txn: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<TransactionHistoryResponse>(`/api/tips/txn/${enc(hash)}`, chain, signal),
  rejected: (chain: TipsChain, signal?: AbortSignal) =>
    get<RejectedTransactionsResponse>('/api/tips/rejected', chain, signal),
  bundle: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<BundleHistoryResponse>(`/api/tips/bundle/${enc(hash)}`, chain, signal),
};
