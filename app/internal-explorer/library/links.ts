// Internal-link helpers for Internal Explorer. Detail-page links must carry the
// active `?chain=` so the selected chain persists across navigation and the URL
// stays shareable.

import { TIPS_PATH } from '../flag';
import type { TipsChain } from '../chains';

/**
 * Append the active chain to an Internal Explorer path.
 * `subpath` is relative to the explorer root (`''`, `'/blocks'`, `` `/txn/${hash}` ``).
 */
export function tipsHref(subpath: string, chain: TipsChain): string {
  const path = `${TIPS_PATH}${subpath}`;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}chain=${chain}`;
}
