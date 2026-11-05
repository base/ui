// Newest-first window of recent blocks shared by the live head stream and the
// polling fallback. Client-safe.
import type { BlockSummary } from './types';

/**
 * Merge `incoming` into `current`, keeping one block per height (the incoming
 * one wins, so a reorged head replaces the old block) and the newest `limit`.
 */
export function mergeBlockWindow(
  current: readonly BlockSummary[],
  incoming: readonly BlockSummary[],
  limit: number,
): BlockSummary[] {
  const byNumber = new Map<number, BlockSummary>();
  for (const block of current) byNumber.set(block.number, block);
  for (const block of incoming) byNumber.set(block.number, block);
  return [...byNumber.values()].sort((lhs, rhs) => rhs.number - lhs.number).slice(0, limit);
}
