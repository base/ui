// Network + shadow-chain model for the Shadow Explorer section. Client-safe: no
// env, no server imports. A shadow surface is addressed by two dimensions — the
// underlying network (mainnet/sepolia/zeronet) and one of 1:N shadow chains
// configured for that network (e.g. a release-candidate canary, an experimental
// build). Both dimensions live in the URL path (/shadow-explorer/<network>/<chain>/...).

export type ShadowNetwork = 'mainnet' | 'sepolia' | 'zeronet';

export type ShadowNetworkInfo = {
  id: ShadowNetwork;
  label: string;
};

export const SHADOW_NETWORKS: readonly ShadowNetworkInfo[] = [
  { id: 'mainnet', label: 'Base Mainnet' },
  { id: 'sepolia', label: 'Base Sepolia' },
  { id: 'zeronet', label: 'Zeronet' },
];

export const DEFAULT_SHADOW_NETWORK: ShadowNetwork = 'mainnet';

export function isShadowNetwork(value: string | null | undefined): value is ShadowNetwork {
  return value === 'mainnet' || value === 'sepolia' || value === 'zeronet';
}

export function resolveShadowNetwork(value: string | null | undefined): ShadowNetwork {
  return isShadowNetwork(value) ? value : DEFAULT_SHADOW_NETWORK;
}

// One selectable shadow chain within a network. `url` (the shadow-metrics base
// URL) is intentionally absent: it stays server-side in the config registry and
// is never sent to the client.
export interface ShadowChainInfo {
  id: string;
  label: string;
  purpose?: string;
}
