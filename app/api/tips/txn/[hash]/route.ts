import { resolveTipsChain } from '../../../../tips/chains';
import { type BundleEvent, getBundleHistory, getTransactionMetadataByHash } from '../../s3';

import { tipsDisabledResponse } from '../../guard';

export const runtime = 'nodejs';

export interface TransactionEvent {
  type: string;
  data: {
    bundle_id?: string;
    transactions?: Array<{
      id: {
        sender: string;
        nonce: string;
        hash: string;
      };
      data: string;
    }>;
    transaction_ids?: Array<{
      sender: string;
      nonce: string;
      hash: string;
    }>;
    block_number?: number;
    flashblock_index?: number;
    block_hash?: string;
  };
}

export interface TransactionHistoryResponse {
  hash: string;
  bundle_ids: string[];
  history: BundleEvent[];
}

export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));

  try {
    const { hash } = await params;

    const metadata = await getTransactionMetadataByHash(chain, hash);

    if (!metadata) {
      return Response.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // TODO: Can be in multiple bundles
    const bundle = await getBundleHistory(chain, metadata.bundle_ids[0]);
    if (!bundle) {
      return Response.json({ error: 'Bundle not found' }, { status: 404 });
    }

    const response: TransactionHistoryResponse = {
      hash,
      bundle_ids: metadata.bundle_ids,
      history: bundle.history,
    };

    return Response.json(response);
  } catch (error) {
    console.error('Error fetching transaction data:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
