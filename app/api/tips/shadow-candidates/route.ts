import { resolveTipsChain } from '../../../tips/chains';
import { getShadowMetricsUrl } from '../config';
import { tipsDisabledResponse } from '../guard';
import {
  ShadowNotFoundError,
  ShadowUnavailableError,
  fetchShadowCandidates,
} from '../shadow';

export const runtime = 'nodejs';

// Re-export for client typing.
export type { ShadowBlockSummary } from '../shadow';

export async function GET(request: Request) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;

  const url = new URL(request.url);
  const chain = resolveTipsChain(url.searchParams.get('chain'));
  const canonical = url.searchParams.get('canonical');
  if (!canonical) {
    return Response.json({ error: 'Missing canonical hash' }, { status: 400 });
  }

  const baseUrl = getShadowMetricsUrl(chain);
  if (!baseUrl) {
    return Response.json({ error: 'Shadow metrics not configured' }, { status: 503 });
  }

  try {
    const candidates = await fetchShadowCandidates(baseUrl, canonical);
    return Response.json({ candidates });
  } catch (error) {
    if (error instanceof ShadowNotFoundError) {
      return Response.json({ candidates: [] });
    }

    console.error('Error fetching shadow candidates:', error);
    return Response.json(
      { error: 'Shadow candidates unavailable' },
      { status: error instanceof ShadowUnavailableError ? 503 : 500 },
    );
  }
}
