import { resolveExplorerChainFromRequest } from '../../chain';
import { getShadowMetricsUrl } from '../../config';
import { explorerDisabledResponse } from '../../guard';
import {
  ShadowNotFoundError,
  ShadowUnavailableError,
  fetchShadowBlockDetail,
  fetchShadowBlockSummary,
} from '../../shadow';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;

  const url = new URL(request.url);
  const chain = resolveExplorerChainFromRequest(request);
  const baseUrl = getShadowMetricsUrl(chain);
  if (!baseUrl) {
    return Response.json({ error: 'Shadow metrics not configured' }, { status: 503 });
  }

  try {
    const { hash } = await params;
    const [summary, detail] = await Promise.all([
      fetchShadowBlockSummary(baseUrl, hash),
      fetchShadowBlockDetail(baseUrl, hash),
    ]);
    return Response.json({ summary, detail });
  } catch (error) {
    if (error instanceof ShadowNotFoundError) {
      return Response.json({ error: 'Shadow block not found' }, { status: 404 });
    }

    console.error('Error fetching shadow block:', error);
    return Response.json(
      { error: 'Shadow block unavailable' },
      { status: error instanceof ShadowUnavailableError ? 503 : 500 },
    );
  }
}
