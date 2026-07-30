// Internal-link helpers for the TIPS section. Detail-page links must carry the
// active `?chain=` so the selected chain persists across navigation and the URL
// stays shareable.

import type { TipsChain } from '../chains';

/** Append the active chain to an internal TIPS path (`/tips/...`). */
export function tipsHref(path: string, chain: TipsChain): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}chain=${chain}`;
}
