import type { ShadowChainInfo } from '../../../shadow-explorer/networks';
import { resolveShadowNetwork } from '../../../shadow-explorer/networks';
import { listShadowChains } from '../config';
import { shadowExplorerDisabledResponse } from '../guard';

export const runtime = 'nodejs';

export interface ShadowChainsResponse {
  chains: ShadowChainInfo[];
}

export async function GET(request: Request) {
  const disabled = shadowExplorerDisabledResponse();
  if (disabled) return disabled;

  const network = resolveShadowNetwork(new URL(request.url).searchParams.get('network'));
  const body: ShadowChainsResponse = { chains: listShadowChains(network) };
  return Response.json(body);
}
