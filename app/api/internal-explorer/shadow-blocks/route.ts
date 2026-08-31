import { resolveExplorerChain } from '../../../internal-explorer/chains';
import { getShadowMetricsUrl } from '../config';
import { explorerDisabledResponse } from '../guard';
import { fetchRecentShadowBlocks } from '../shadow';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function parsePositiveInt(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
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

  const limit = Math.min(parsePositiveInt(url.searchParams.get('limit')) ?? DEFAULT_LIMIT, MAX_LIMIT);
  const before = parsePositiveInt(url.searchParams.get('before'));

  return Response.json(await fetchRecentShadowBlocks(baseUrl, { limit, before }));
}
