// Newest-first window of recent blocks shared by the live head stream and the
// polling fallback. Client-safe.
import type { BlockSummary } from './types';

/**
 * Merge `incoming` into `current`, keeping one block per height (the incoming
 * one wins, so a reorged head replaces the old block) and the newest `limit`.
 * A repeat of the same block keeps details the incoming copy lacks.
 */
export function mergeBlockWindow(
  current: readonly BlockSummary[],
  incoming: readonly BlockSummary[],
  limit: number,
): BlockSummary[] {
  const byNumber = new Map<number, BlockSummary>();
  for (const block of current) byNumber.set(block.number, block);
  for (const block of incoming) {
    const existing = byNumber.get(block.number);
    byNumber.set(
      block.number,
      existing?.hash === block.hash
        ? {
            ...block,
            timestampMs: block.timestampMs ?? existing.timestampMs,
            transactionCount: block.transactionCount ?? existing.transactionCount,
          }
        : block,
    );
  }
  return [...byNumber.values()].sort((lhs, rhs) => rhs.number - lhs.number).slice(0, limit);
}

/**
 * Replace rows with their fetched full summaries. Only rows whose hash still
 * matches are replaced, so a fetch that raced a reorg can't swap in a
 * different block; the reorged head arrives on the stream on its own.
 */
export function fillBlockDetails(
  current: readonly BlockSummary[],
  fetched: readonly BlockSummary[],
): BlockSummary[] {
  const byHash = new Map(fetched.map((block) => [block.hash, block]));
  return current.map((block) => byHash.get(block.hash) ?? block);
}
