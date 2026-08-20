// Fetch client for the Shadow Explorer API (/api/shadow-explorer/*, same-origin
// route handlers). Unlike the TIPS client, requests are addressed by explicit
// network + shadow-chain params rather than a single ?chain=.

import type { ShadowChainsResponse } from '../../api/shadow-explorer/chains/route';
import type { ShadowBlocksResponse } from '../../api/shadow-explorer/shadow-blocks/route';
import type { ShadowNetwork } from '../networks';

export class ShadowExplorerApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ShadowExplorerApiError';
    this.status = status;
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  if (!response.ok) {
    throw new ShadowExplorerApiError(
      `Shadow Explorer API request to ${path} failed (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export const shadowExplorerApi = {
  chains: (network: ShadowNetwork, signal?: AbortSignal) =>
    get<ShadowChainsResponse>(withQuery('/api/shadow-explorer/chains', { network }), signal),
  shadowBlocks: (
    network: ShadowNetwork,
    chain: string,
    options?: { offset?: number; limit?: number },
    signal?: AbortSignal,
  ) =>
    get<ShadowBlocksResponse>(
      withQuery('/api/shadow-explorer/shadow-blocks', {
        network,
        chain,
        offset: options?.offset,
        limit: options?.limit,
      }),
      signal,
    ),
};
