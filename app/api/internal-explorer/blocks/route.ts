import { resolveTipsChain } from '../../../internal-explorer/chains';
import {
  BlockListUnavailableError,
  InvalidBlockListQueryError,
  listBlocks,
  parseBlockListQuery,
} from '../block-list';
import { getRpcUrl } from '../config';
import { tipsDisabledResponse } from '../guard';

export const runtime = 'nodejs';

// Cursor-paginated block list, read directly from the execution RPC. See
// app/api/internal-explorer/block-list.ts. Types are re-exported for the client library.
export type { BlockSummary, BlocksPage, BlocksResponse } from '../block-list';

export async function GET(request: Request) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));

  try {
    const query = parseBlockListQuery(new URL(request.url).searchParams);
    return Response.json(await listBlocks(getRpcUrl(chain), query));
  } catch (error) {
    if (error instanceof InvalidBlockListQueryError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error('Error fetching block list:', error);
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
