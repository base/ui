// Chain model for Internal Explorer. Client-safe: the data for each chain
// used to be a separate deployment; here chain is a runtime parameter carried in
// the URL (?chain=) and passed to /api/internal-explorer/* which resolves
// per-chain S3 + RPC.

import { defaultExplorerChainForOrigin, type ExplorerHostMap } from './hosts';

export type ExplorerChain = 'mainnet' | 'sepolia' | 'zeronet';

export type PublicExplorerName = 'Basescan' | 'Blockscout';

export type PublicExplorerResource = 'tx' | 'address' | 'block';

export type PublicExplorerLink = {
  name: PublicExplorerName;
  href: string;
};

export type ExplorerChainInfo = {
  id: ExplorerChain;
  label: string;
  // Blockscout base URL. Empty when the chain has no Blockscout (Zeronet).
  blockscoutUrl: string;
  // Basescan base URL. Empty when the chain has no Basescan (Zeronet).
  basescanUrl: string;
};

const DEFAULT_BLOCKSCOUT: Record<ExplorerChain, string> = {
  mainnet: 'https://base.blockscout.com',
  sepolia: 'https://base-sepolia.blockscout.com',
  zeronet: '',
};

const DEFAULT_BASESCAN: Record<ExplorerChain, string> = {
  mainnet: 'https://basescan.org',
  sepolia: 'https://sepolia.basescan.org',
  zeronet: '',
};

export const EXPLORER_CHAINS: readonly ExplorerChainInfo[] = (
  ['mainnet', 'sepolia', 'zeronet'] as const
).map((id) => ({
  id,
  label: id === 'mainnet' ? 'Base Mainnet' : id === 'sepolia' ? 'Base Sepolia' : 'Zeronet',
  blockscoutUrl: DEFAULT_BLOCKSCOUT[id],
  basescanUrl: DEFAULT_BASESCAN[id],
}));

export const DEFAULT_EXPLORER_CHAIN: ExplorerChain = 'mainnet';

export function isExplorerChain(value: string | null | undefined): value is ExplorerChain {
  return value === 'mainnet' || value === 'sepolia' || value === 'zeronet';
}

/** Keep an explicit `?chain=`. When it is missing, default from the request origin. */
export function resolveExplorerChain(
  value: string | null | undefined,
  origin?: string | null,
  hosts?: ExplorerHostMap | null,
): ExplorerChain {
  if (isExplorerChain(value)) return value;
  return defaultExplorerChainForOrigin(origin ?? '', hosts ?? {});
}

export function explorerChainInfo(chain: ExplorerChain): ExplorerChainInfo {
  return EXPLORER_CHAINS.find((c) => c.id === chain) ?? EXPLORER_CHAINS[0];
}

function joinExplorerUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Path on Basescan and Blockscout for a tx, address, or block. */
export function publicExplorerPath(type: PublicExplorerResource, value: string): string {
  if (type === 'tx') return `/tx/${value}`;
  if (type === 'address') return `/address/${value}`;
  return `/block/${value}`;
}

/** Public explorers that exist for this chain, in display order. */
export function publicExplorerLinks(chain: ExplorerChain, path: string): PublicExplorerLink[] {
  const info = explorerChainInfo(chain);
  const links: PublicExplorerLink[] = [];
  if (info.basescanUrl) {
    links.push({ name: 'Basescan', href: joinExplorerUrl(info.basescanUrl, path) });
  }
  if (info.blockscoutUrl) {
    links.push({ name: 'Blockscout', href: joinExplorerUrl(info.blockscoutUrl, path) });
  }
  return links;
}

/** Blockscout URL for a chain, or null when that chain has no Blockscout. */
export function blockscoutHref(chain: ExplorerChain, path: string): string | null {
  const base = explorerChainInfo(chain).blockscoutUrl;
  if (!base) return null;
  return joinExplorerUrl(base, path);
}
