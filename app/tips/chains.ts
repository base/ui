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

export const TIPS_CHAINS: readonly TipsChainInfo[] = (
  ['mainnet', 'sepolia', 'zeronet'] as const
).map((id) => ({
  id,
  label: id === 'mainnet' ? 'Base Mainnet' : id === 'sepolia' ? 'Base Sepolia' : 'Zeronet',
  explorerUrl: explorerFor(id),
}));

export const DEFAULT_TIPS_CHAIN: TipsChain = 'mainnet';

export function isTipsChain(value: string | null | undefined): value is TipsChain {
  return value === 'mainnet' || value === 'sepolia' || value === 'zeronet';
}

/** Normalize an unknown ?chain= value to a valid chain (falls back to default). */
export function resolveTipsChain(value: string | null | undefined): TipsChain {
  return isTipsChain(value) ? value : DEFAULT_TIPS_CHAIN;
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
