import { resolveExplorerChain } from '../../../internal-explorer/chains';
import { BlockListUnavailableError, fetchBlocksByNumbers } from '../block-list';
import { getRpcUrl } from '../config';
import { explorerDisabledResponse } from '../guard';

export const runtime = 'nodejs';

export type { BlockSummary } from '../block-list';

const MAX_NUMBERS = 100;

export async function GET(request: Request) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;

  const url = new URL(request.url);
  const chain = resolveExplorerChain(url.searchParams.get('chain'));

  const raw = url.searchParams.get('numbers');
  if (!raw) {
    return Response.json({ error: 'Missing block numbers' }, { status: 400 });
  }

  const numbers = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (numbers.length === 0 || numbers.length > MAX_NUMBERS) {
    return Response.json({ error: 'Invalid block numbers' }, { status: 400 });
  }

  if (numbers.some((value) => !/^(0|[1-9]\d*)$/.test(value))) {
    return Response.json({ error: 'Invalid block numbers' }, { status: 400 });
  }

  const parsed = numbers.map(Number);
  if (parsed.some((value) => !Number.isSafeInteger(value))) {
    return Response.json({ error: 'Invalid block numbers' }, { status: 400 });
  }

  try {
    return Response.json(await fetchBlocksByNumbers(getRpcUrl(chain), parsed));
  } catch (error) {
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
