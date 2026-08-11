import { resolveTipsChain } from '../../../../tips/chains';
import { tipsDisabledResponse } from '../../guard';
import {
  InvalidTransactionHashError,
  lookupTransaction,
  type TransactionLookupResponse,
} from '../../transaction-lookup';

export const runtime = 'nodejs';

// The canonical transaction view is now multi-source (audit events + on-chain
// tx/receipt + legacy S3 archive), merged and coverage-annotated by
// lookupTransaction. See app/api/tips/transaction-lookup.ts.
export type TransactionHistoryResponse = TransactionLookupResponse;

export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));

  try {
    const { hash } = await params;
    const lookup = await lookupTransaction(chain, hash);
    if (!lookup.found) {
      return Response.json(
        {
          error: lookup.unavailable ? 'Transaction lookup unavailable' : 'Transaction not found',
          coverage: lookup.response.coverage,
        },
        { status: lookup.unavailable ? 503 : 404 },
      );
    }

    return Response.json(lookup.response);
  } catch (error) {
    if (error instanceof InvalidTransactionHashError) {
      return Response.json({ error: 'Invalid transaction hash' }, { status: 400 });
    }

    console.error('Error fetching transaction data:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
