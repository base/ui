import { resolveTipsChain } from '../../../tips/chains';
import { getShadowMetricsUrl } from '../config';
import { tipsDisabledResponse } from '../guard';
import {
  InvalidShadowBlocksQueryError,
  ShadowBlocksUnavailableError,
  listShadowBlocks,
  parseShadowBlocksQuery,
} from '../shadow-blocks';

export const runtime = 'nodejs';

// Offset-paginated shadow block list, proxied from the shadow-metrics HTTP API.
// See app/api/tips/shadow-blocks.ts. Types are re-exported for the client library.
export type { ShadowBlockSummary, ShadowBlocksPage, ShadowBlocksResponse } from '../shadow-blocks';

export async function GET(request: Request) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));

  const baseUrl = getShadowMetricsUrl(chain);
  if (!baseUrl) {
    return Response.json(
      { error: 'Shadow metrics not configured for this chain' },
      { status: 503 },
    );
  }

  try {
    const query = parseShadowBlocksQuery(new URL(request.url).searchParams);
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
