import { findLatestActiveBlockFromRpc, parseActiveBlockQuery } from '../../active-block';
import { BlockListUnavailableError, InvalidBlockListQueryError } from '../../block-list';
import { resolveExplorerChainFromRequest } from '../../chain';
import { getRpcUrl } from '../../config';
import { explorerDisabledResponse } from '../../guard';

export const runtime = 'nodejs';

export type { LatestActiveBlockResponse } from '../../active-block';

export async function GET(request: Request) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveExplorerChainFromRequest(request);

  try {
    const query = parseActiveBlockQuery(new URL(request.url).searchParams);
    const startBlockNumber = query.before === null ? undefined : query.before - 1;
    const block = await findLatestActiveBlockFromRpc(getRpcUrl(chain), startBlockNumber);
    if (!block) {
      return Response.json({ error: 'No active block found' }, { status: 404 });
    }
    return Response.json(block);
  } catch (error) {
    if (error instanceof InvalidBlockListQueryError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error('Error finding active block:', error);
    return Response.json(
      {
        error:
          error instanceof BlockListUnavailableError
            ? 'Block list unavailable'
            : 'Internal server error',
      },
      { status: error instanceof BlockListUnavailableError ? 503 : 500 },
    );
  }
}
