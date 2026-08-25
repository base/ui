// Internal-link helpers for Internal Explorer. Detail-page links must carry the
// active `?chain=` so the selected chain persists across navigation and the URL
// stays shareable.

import type { ExplorerChain } from '../chains';

/**
 * Append the active chain to an Internal Explorer path.
 * `subpath` is relative to the explorer root (`''`, `'/blocks'`, `` `/txn/${hash}` ``).
 */
export function explorerHref(subpath: string, chain: ExplorerChain): string {
  const path = `/internal-explorer${subpath}`;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}chain=${chain}`;
}
