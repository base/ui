import { resolveTipsChain } from '../../../tips/chains';
import {
  getRejectedTransaction,
  listRejectedTransactions,
  type RejectedTransaction,
} from '../s3';

import { tipsDisabledResponse } from '../guard';

export const runtime = 'nodejs';

export interface RejectedTransactionsResponse {
  transactions: RejectedTransaction[];
}

export async function GET(request: Request) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));

  try {
    const summaries = await listRejectedTransactions(chain, 100);

    const transactions = (
      await Promise.all(
        summaries.map((s) => getRejectedTransaction(chain, s.blockNumber, s.txHash)),
      )
    ).filter((tx): tx is RejectedTransaction => tx !== null);

    const response: RejectedTransactionsResponse = { transactions };
    return Response.json(response);
  } catch (error) {
    console.error('Error fetching rejected transactions:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
