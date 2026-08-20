import type { ShadowNetwork } from '../networks';

// Builds an internal Shadow Explorer path. Network and shadow chain are path
// segments (not query params), so links are self-describing and shareable.
export function shadowHref(network: ShadowNetwork, chain: string, path = ''): string {
  return `/shadow-explorer/${network}/${encodeURIComponent(chain)}${path}`;
}

// Canonical block inspection is TIPS's domain (S3/RPC), not shadow-explorer's, so
// canonical references link out to it. TIPS chains share the same network ids,
// carried as ?chain=.
export function tipsCanonicalBlockHref(network: ShadowNetwork, hash: string): string {
  return `/tips/block/${encodeURIComponent(hash)}?chain=${network}`;
}
