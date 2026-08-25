import { resolveExplorerChain } from '../../../internal-explorer/chains';
import { getShadowMetricsUrl } from '../config';
import { explorerDisabledResponse } from '../guard';
import { fetchShadowCandidates } from '../shadow';

export const runtime = 'nodejs';

const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

// Re-export for client typing.
export type { ShadowBlockSummary } from '../shadow';

export async function GET(request: Request) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;

  const url = new URL(request.url);
  const chain = resolveExplorerChain(url.searchParams.get('chain'));
  const canonical = url.searchParams.get('canonical');
  if (!canonical) {
    return Response.json({ error: 'Missing canonical hash' }, { status: 400 });
  }

  const normalized = canonical.trim().toLowerCase();
  if (!HASH_PATTERN.test(normalized)) {
    return Response.json({ error: 'Invalid canonical hash' }, { status: 400 });
  }

  const baseUrl = getShadowMetricsUrl(chain);
  if (!baseUrl) {
    return Response.json({ error: 'Shadow metrics not configured' }, { status: 503 });
  }

  const candidates = await fetchShadowCandidates(baseUrl, normalized);
  return Response.json({ candidates });
}
