// Chain-aware fetch client for the TIPS API.
//
// The API lives at /api/tips/* (same-origin route handlers) and is chain-aware:
// every request carries the currently selected chain as `?chain=<id>`. Callers
// pass the resolved TipsChain from useTipsChain().

import type { TipsChain } from '../chains';
import type {
  BlockDetailResponse,
  BlocksResponse,
  BundleHistoryResponse,
  RejectedTransactionsResponse,
  ShadowBlockDetail,
  ShadowBlockSummary,
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
      `TIPS API request to ${path} failed (${response.status})`,
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
    get<BlocksResponse>('/api/tips/blocks', chain, signal),
  blocksPage: (
    chain: TipsChain,
    options?: { cursor?: number; limit?: number },
    signal?: AbortSignal,
  ) =>
    get<BlocksResponse>(
      withQuery('/api/tips/blocks', { cursor: options?.cursor, limit: options?.limit }),
      chain,
      signal,
    ),
  txs: (
    chain: TipsChain,
    options?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ) =>
    get<TransactionsResponse>(
      withQuery('/api/tips/txs', { cursor: options?.cursor, limit: options?.limit }),
      chain,
      signal,
    ),
  block: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<BlockDetailResponse>(`/api/tips/block/${enc(hash)}`, chain, signal),
  txn: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<TransactionHistoryResponse>(`/api/tips/txn/${enc(hash)}`, chain, signal),
  rejected: (chain: TipsChain, signal?: AbortSignal) =>
    get<RejectedTransactionsResponse>('/api/tips/rejected', chain, signal),
  bundle: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<BundleHistoryResponse>(`/api/tips/bundle/${enc(hash)}`, chain, signal),
  shadowCandidates: (chain: TipsChain, canonicalHash: string, signal?: AbortSignal) =>
    get<{ candidates: ShadowBlockSummary[] }>(
      withQuery('/api/tips/shadow-candidates', { canonical: canonicalHash }),
      chain,
      signal,
    ),
  shadowCandidatesBatch: (chain: TipsChain, hashes: string[], signal?: AbortSignal) =>
    get<Record<string, ShadowBlockSummary[]>>(
      withQuery('/api/tips/shadow-candidates-batch', { canonical: hashes.join(',') }),
      chain,
      signal,
    ),
  shadowBlock: (hash: string, chain: TipsChain, signal?: AbortSignal) =>
    get<{ summary: ShadowBlockSummary; detail: ShadowBlockDetail }>(
      `/api/tips/shadow-block/${enc(hash)}`,
      chain,
      signal,
    ),
};
