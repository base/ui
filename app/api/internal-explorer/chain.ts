// Resolve the active ExplorerChain from an API request: explicit `?chain=`
// wins; otherwise the Host header picks the origin default (zeronet on aws-dev,
// mainnet on aws prod or when no hosts are configured).
import { resolveExplorerChain, type ExplorerChain } from '../../internal-explorer/chains';
import { originFromHostHeader } from '../../internal-explorer/hosts';
import { getExplorerHosts } from './config';

export function resolveExplorerChainFromRequest(request: Request): ExplorerChain {
  const chainParam = new URL(request.url).searchParams.get('chain');
  const origin = originFromHostHeader(
    request.headers.get('host'),
    request.headers.get('x-forwarded-host'),
  );
  return resolveExplorerChain(chainParam, origin, getExplorerHosts());
}
