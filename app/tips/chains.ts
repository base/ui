// Chain model for the TIPS surface. Client-safe: the tips data for each chain
// used to be a separate deployment; here chain is a runtime parameter carried in
// the URL (?chain=) and passed to /api/tips/* which resolves per-chain S3 + RPC.

export type TipsChain = 'mainnet' | 'sepolia' | 'zeronet';

export type TipsChainInfo = {
  id: TipsChain;
  label: string;
  // Public block-explorer base URL for this chain's links. Overridable via
  // NEXT_PUBLIC_TIPS_<CHAIN>_EXPLORER_URL; defaults below.
  explorerUrl: string;
};

const DEFAULT_EXPLORERS: Record<TipsChain, string> = {
  mainnet: 'https://base.blockscout.com',
  sepolia: 'https://base-sepolia.blockscout.com',
  zeronet: '',
};

function explorerFor(chain: TipsChain): string {
  const key = `NEXT_PUBLIC_TIPS_${chain.toUpperCase()}_EXPLORER_URL`;
  const configured = process.env[key];
  return configured && configured.length > 0 ? configured : DEFAULT_EXPLORERS[chain];
}

/** Every chain the TIPS surface knows how to render, in display order. */
export const ALL_TIPS_CHAINS = ['mainnet', 'sepolia', 'zeronet'] as const;

export const TIPS_CHAINS: readonly TipsChainInfo[] = ALL_TIPS_CHAINS.map((id) => ({
  id,
  label: id === 'mainnet' ? 'Base Mainnet' : id === 'sepolia' ? 'Base Sepolia' : 'Zeronet',
  explorerUrl: explorerFor(id),
}));

export const DEFAULT_TIPS_CHAIN: TipsChain = 'mainnet';

export function isTipsChain(value: string | null | undefined): value is TipsChain {
  return value === 'mainnet' || value === 'sepolia' || value === 'zeronet';
}

/**
 * Normalize an unknown ?chain= value to a chain that is actually available.
 *
 * `enabled` defaults to every known chain, so callers with no deployment
 * context behave as before. When the requested chain is absent from `enabled`
 * — a stale link, or a URL hand-edited to a chain this deployment does not
 * serve — this falls back to the default chain if it is enabled, else to the
 * first enabled one, so the caller always gets a chain it can serve.
 */
export function resolveTipsChain(
  value: string | null | undefined,
  enabled: readonly TipsChain[] = ALL_TIPS_CHAINS,
): TipsChain {
  if (enabled.length === 0) return DEFAULT_TIPS_CHAIN;
  if (isTipsChain(value) && enabled.includes(value)) return value;
  return enabled.includes(DEFAULT_TIPS_CHAIN) ? DEFAULT_TIPS_CHAIN : enabled[0];
}

/**
 * Parse a `TIPS_CHAINS` allowlist ("mainnet,sepolia") into chain ids.
 *
 * Unset or empty means every known chain — the local-dev and pre-configuration
 * default, which keeps behaviour unchanged for deployments that do not set it.
 * Unknown names are dropped rather than failing the request: the env var is
 * operator-supplied, and a typo should not take the whole section down. A value
 * naming only unknown chains is treated as unset for the same reason.
 */
export function parseTipsChains(raw: string | null | undefined): readonly TipsChain[] {
  if (!raw) return ALL_TIPS_CHAINS;
  const named = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(isTipsChain);
  if (named.length === 0) return ALL_TIPS_CHAINS;
  // Keep the catalogue's display order and drop duplicates.
  return ALL_TIPS_CHAINS.filter((id) => named.includes(id));
}

export function tipsChainInfo(chain: TipsChain): TipsChainInfo {
  return TIPS_CHAINS.find((c) => c.id === chain) ?? TIPS_CHAINS[0];
}

/** Explorer link for a chain, or null when that chain has no explorer configured. */
export function tipsExplorerHref(chain: TipsChain, path: string): string | null {
  const base = tipsChainInfo(chain).explorerUrl;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
