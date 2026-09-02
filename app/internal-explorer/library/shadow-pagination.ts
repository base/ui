// Pagination cursor for the shadow-delta block view. Shadow blocks come back
// newest-first; the API's `before` param is an *exclusive* block-number cutoff,
// so the next page starts at the oldest block returned (no overlap, no gap). A
// short page means the source is exhausted.
import type { ShadowBlockSummary } from './types';

export function nextShadowCursor(
  shadows: Pick<ShadowBlockSummary, 'number'>[],
  pageLimit: number,
): number | null {
  if (shadows.length < pageLimit) return null;
  const oldest = shadows.at(-1)?.number;
  return oldest === undefined || oldest <= 0 ? null : oldest;
}
