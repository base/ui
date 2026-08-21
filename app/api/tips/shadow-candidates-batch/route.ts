import { resolveTipsChain } from '../../../tips/chains';
import { getShadowMetricsUrl } from '../config';
import { tipsDisabledResponse } from '../guard';
import { fetchShadowCandidatesBatch } from '../shadow';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;

  const url = new URL(request.url);
  const chain = resolveTipsChain(url.searchParams.get('chain'));
  const canonical = url.searchParams.get('canonical');
  if (!canonical) {
    return Response.json({ error: 'Missing canonical hashes' }, { status: 400 });
  }

  const baseUrl = getShadowMetricsUrl(chain);
  if (!baseUrl) {
    return Response.json({ error: 'Shadow metrics not configured' }, { status: 503 });
  }

  const hashes = canonical
    .split(',')
    .map((hash) => hash.trim())
    .filter(Boolean);

  return Response.json(await fetchShadowCandidatesBatch(baseUrl, hashes));
}
