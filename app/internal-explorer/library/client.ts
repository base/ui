// Chain-aware fetch client for the Internal Explorer API.
//
// The API lives at /api/internal-explorer/* (same-origin route handlers) and is
// chain-aware: every request carries the currently selected chain as
// `?chain=<id>`. Callers pass the resolved ExplorerChain from useExplorerChain().

import type { ExplorerChain } from '../chains';
import type {
  BlockDetailResponse,
  BlocksResponse,
  BlockSummary,
  LatestActiveBlockResponse,
  BundleHistoryResponse,
  RejectedTransactionsResponse,
  ShadowBlockDetail,
  ShadowBlockSummary,
  TransactionHistoryResponse,
  TransactionsResponse,
} from './types';

/** Thrown when the API responds with a non-2xx status. */
export class ExplorerApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ExplorerApiError';
    this.status = status;
  }
}

const enc = encodeURIComponent;

// Append `chain` to the path's query string (handles paths that already carry
// a `?`), then fetch with no caching so live data never goes stale.
async function get<T>(path: string, chain: ExplorerChain, signal?: AbortSignal): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${path}${separator}chain=${chain}`, {
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new ExplorerApiError(
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
export const explorerApi = {
  blocks: (chain: ExplorerChain, signal?: AbortSignal) =>
    get<BlocksResponse>('/api/internal-explorer/blocks', chain, signal),
  blocksPage: (
    chain: ExplorerChain,
    options?: { cursor?: number; limit?: number },
    signal?: AbortSignal,
  ) =>
    get<BlocksResponse>(
      withQuery('/api/internal-explorer/blocks', { cursor: options?.cursor, limit: options?.limit }),
      chain,
      signal,
    ),
  latestActiveBlock: (
    chain: ExplorerChain,
    options?: { before?: number },
    signal?: AbortSignal,
  ) =>
    get<LatestActiveBlockResponse>(
      withQuery('/api/internal-explorer/blocks/latest-active', { before: options?.before }),
      chain,
      signal,
    ),
  txs: (
    chain: ExplorerChain,
    options?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ) =>
    get<TransactionsResponse>(
      withQuery('/api/internal-explorer/txs', { cursor: options?.cursor, limit: options?.limit }),
      chain,
      signal,
    ),
  block: (hash: string, chain: ExplorerChain, signal?: AbortSignal) =>
    get<BlockDetailResponse>(`/api/internal-explorer/block/${enc(hash)}`, chain, signal),
  txn: (hash: string, chain: ExplorerChain, signal?: AbortSignal) =>
    get<TransactionHistoryResponse>(`/api/internal-explorer/txn/${enc(hash)}`, chain, signal),
  rejected: (chain: ExplorerChain, signal?: AbortSignal) =>
    get<RejectedTransactionsResponse>('/api/internal-explorer/rejected', chain, signal),
  bundle: (hash: string, chain: ExplorerChain, signal?: AbortSignal) =>
    get<BundleHistoryResponse>(`/api/internal-explorer/bundle/${enc(hash)}`, chain, signal),
  shadowCandidates: (chain: ExplorerChain, canonicalHash: string, signal?: AbortSignal) =>
    get<{ candidates: ShadowBlockSummary[] }>(
      withQuery('/api/internal-explorer/shadow-candidates', { canonical: canonicalHash }),
      chain,
      signal,
    ),
  shadowCandidatesBatch: (chain: ExplorerChain, hashes: string[], signal?: AbortSignal) =>
    get<Record<string, ShadowBlockSummary[]>>(
      withQuery('/api/internal-explorer/shadow-candidates-batch', { canonical: hashes.join(',') }),
      chain,
      signal,
    ),
  shadowBlock: (hash: string, chain: ExplorerChain, signal?: AbortSignal) =>
    get<{ summary: ShadowBlockSummary; detail: ShadowBlockDetail }>(
      `/api/internal-explorer/shadow-block/${enc(hash)}`,
      chain,
      signal,
    ),
  recentShadowBlocks: (
    chain: ExplorerChain,
    options?: { limit?: number; before?: number },
    signal?: AbortSignal,
  ) =>
    get<ShadowBlockSummary[]>(
      withQuery('/api/internal-explorer/shadow-blocks', {
        limit: options?.limit,
        before: options?.before,
      }),
      chain,
      signal,
    ),
  blocksByNumbers: (chain: ExplorerChain, numbers: number[], signal?: AbortSignal) =>
    get<BlockSummary[]>(
      withQuery('/api/internal-explorer/blocks-by-numbers', { numbers: numbers.join(',') }),
      chain,
      signal,
    ),
};
