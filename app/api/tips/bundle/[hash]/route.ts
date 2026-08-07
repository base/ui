import { resolveTipsChain } from '../../../../tips/chains';
import { type BundleEvent, getBundleHistory } from '../../s3';

import { tipsDisabledResponse } from '../../guard';

export const runtime = 'nodejs';

export interface BundleHistoryResponse {
  hash: string;
  history: BundleEvent[];
}

export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));

  try {
    const { hash } = await params;

    const bundle = await getBundleHistory(chain, hash);
    if (!bundle) {
      return Response.json({ error: 'Bundle not found' }, { status: 404 });
    }

    const history = bundle.history;
    history.sort((lhs, rhs) => (lhs.data.timestamp < rhs.data.timestamp ? -1 : 1));

    const response: BundleHistoryResponse = {
      hash,
      history: bundle.history,
    };

    return Response.json(response);
  } catch (error) {
    console.error('Error fetching bundle data:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
