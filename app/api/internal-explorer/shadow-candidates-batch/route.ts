import { resolveExplorerChain } from '../../../internal-explorer/chains';
import { getShadowMetricsUrl } from '../config';
import { explorerDisabledResponse } from '../guard';
import { fetchShadowCandidatesBatch } from '../shadow';

export const runtime = 'nodejs';

const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const MAX_CANONICAL_BATCH = 200;

export async function GET(request: Request) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;

  const url = new URL(request.url);
  const chain = resolveExplorerChain(url.searchParams.get('chain'));
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
    .filter(Boolean)
    .map((hash) => hash.toLowerCase());

  if (hashes.length === 0 || hashes.length > MAX_CANONICAL_BATCH) {
    return Response.json({ error: 'Invalid canonical hashes' }, { status: 400 });
  }

  if (hashes.some((hash) => !HASH_PATTERN.test(hash))) {
    return Response.json({ error: 'Invalid canonical hashes' }, { status: 400 });
  }

  return Response.json(await fetchShadowCandidatesBatch(baseUrl, hashes));
}
