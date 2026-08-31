import { resolveExplorerChain } from '../../../internal-explorer/chains';
import { getShadowMetricsUrl } from '../config';
import { explorerDisabledResponse } from '../guard';
import { ShadowUnavailableError, fetchRecentShadowBlocks } from '../shadow';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// undefined = absent; null = present but malformed (caller should reject).
function parsePositiveInt(value: string | null): number | undefined | null {
  if (value === null) return undefined;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;

  const url = new URL(request.url);
  const chain = resolveExplorerChain(url.searchParams.get('chain'));

  const baseUrl = getShadowMetricsUrl(chain);
  if (!baseUrl) {
    return Response.json({ error: 'Shadow metrics not configured' }, { status: 503 });
  }

  const rawLimit = parsePositiveInt(url.searchParams.get('limit'));
  const before = parsePositiveInt(url.searchParams.get('before'));
  if (rawLimit === null || before === null) {
    return Response.json({ error: 'Invalid limit or before' }, { status: 400 });
  }

  const limit = Math.min(rawLimit ?? DEFAULT_LIMIT, MAX_LIMIT);

  try {
    return Response.json(await fetchRecentShadowBlocks(baseUrl, { limit, before }));
  } catch (error) {
    console.error('Error fetching recent shadow blocks:', error);
    return Response.json(
      { error: 'Shadow blocks unavailable' },
      { status: error instanceof ShadowUnavailableError ? 503 : 500 },
    );
  }
}
