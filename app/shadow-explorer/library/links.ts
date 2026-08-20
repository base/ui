import type { ShadowNetwork } from '../networks';

// Builds an internal Shadow Explorer path. Network and shadow chain are path
// segments (not query params), so links are self-describing and shareable.
export function shadowHref(network: ShadowNetwork, chain: string, path = ''): string {
  return `/shadow-explorer/${network}/${encodeURIComponent(chain)}${path}`;
}
