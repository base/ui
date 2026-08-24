// Chain model for Internal Explorer. Client-safe: the data for each chain
// used to be a separate deployment; here chain is a runtime parameter carried in
// the URL (?chain=) and passed to /api/internal-explorer/* which resolves
// per-chain S3 + RPC.

export type ExplorerChain = 'mainnet' | 'sepolia' | 'zeronet';

export type ExplorerChainInfo = {
  id: ExplorerChain;
  label: string;
  // Public block-explorer base URL for this chain's links. Overridable via
  // NEXT_PUBLIC_TIPS_<CHAIN>_EXPLORER_URL; defaults below.
  explorerUrl: string;
};

const DEFAULT_EXPLORERS: Record<ExplorerChain, string> = {
  mainnet: 'https://base.blockscout.com',
  sepolia: 'https://base-sepolia.blockscout.com',
  zeronet: '',
};

function explorerFor(chain: ExplorerChain): string {
  const key = `NEXT_PUBLIC_TIPS_${chain.toUpperCase()}_EXPLORER_URL`;
  const configured = process.env[key];
  return configured && configured.length > 0 ? configured : DEFAULT_EXPLORERS[chain];
}

export const EXPLORER_CHAINS: readonly ExplorerChainInfo[] = (
  ['mainnet', 'sepolia', 'zeronet'] as const
).map((id) => ({
  id,
  label: id === 'mainnet' ? 'Base Mainnet' : id === 'sepolia' ? 'Base Sepolia' : 'Zeronet',
  explorerUrl: explorerFor(id),
}));

export const DEFAULT_EXPLORER_CHAIN: ExplorerChain = 'mainnet';

export function isExplorerChain(value: string | null | undefined): value is ExplorerChain {
  return value === 'mainnet' || value === 'sepolia' || value === 'zeronet';
}

/** Normalize an unknown ?chain= value to a valid chain (falls back to default). */
export function resolveExplorerChain(value: string | null | undefined): ExplorerChain {
  return isExplorerChain(value) ? value : DEFAULT_EXPLORER_CHAIN;
}

export function explorerChainInfo(chain: ExplorerChain): ExplorerChainInfo {
  return EXPLORER_CHAINS.find((c) => c.id === chain) ?? EXPLORER_CHAINS[0];
}

/** Explorer link for a chain, or null when that chain has no explorer configured. */
export function publicExplorerHref(chain: ExplorerChain, path: string): string | null {
  const base = explorerChainInfo(chain).explorerUrl;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
