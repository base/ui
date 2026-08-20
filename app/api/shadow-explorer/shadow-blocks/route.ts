import { resolveShadowNetwork } from '../../../shadow-explorer/networks';
import { resolveShadowChainUrl } from '../config';
import { shadowExplorerDisabledResponse } from '../guard';
import {
  InvalidShadowBlocksQueryError,
  ShadowBlocksUnavailableError,
  listShadowBlocks,
  parseShadowBlocksQuery,
} from '../shadow-blocks';

export const runtime = 'nodejs';

export type {
  ShadowBlockSummary,
  ShadowBlockHealth,
  ShadowHealthCheck,
  ShadowBlocksPage,
  ShadowBlocksResponse,
} from '../shadow-blocks';

export async function GET(request: Request) {
  const disabled = shadowExplorerDisabledResponse();
  if (disabled) return disabled;

  const url = new URL(request.url);
  const network = resolveShadowNetwork(url.searchParams.get('network'));
  const chainId = url.searchParams.get('chain');
  if (!chainId) {
    return Response.json({ error: 'Missing chain parameter' }, { status: 400 });
  }

  const baseUrl = resolveShadowChainUrl(network, chainId);
  if (!baseUrl) {
    return Response.json({ error: 'Shadow chain not configured' }, { status: 503 });
  }

  try {
    const query = parseShadowBlocksQuery(url.searchParams);
    return Response.json(await listShadowBlocks(baseUrl, query));
  } catch (error) {
    if (error instanceof InvalidShadowBlocksQueryError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error('Error fetching shadow blocks:', error);
    return Response.json(
      {
        error:
          error instanceof ShadowBlocksUnavailableError
            ? 'Shadow blocks unavailable'
            : 'Internal server error',
      },
      { status: error instanceof ShadowBlocksUnavailableError ? 503 : 500 },
    );
  }
}
