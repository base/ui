import { resolveTipsChain, type TipsChain } from '../../../tips/chains';
import {
  getAuditRejectedTransactionEvents,
  rejectedTransactionFromAuditEvent,
} from '../audit-events';
import { getAuditRpcUrl } from '../config';
import { tipsChainDisabledResponse, tipsDisabledResponse } from '../guard';
import { getRejectedTransaction, listRejectedTransactions } from '../s3';
import type { RejectedTransaction } from '../transaction-data';

export const runtime = 'nodejs';

export interface RejectedTransactionsResponse {
  transactions: RejectedTransaction[];
}

export async function GET(request: Request) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));
  const chainDisabled = tipsChainDisabledResponse(chain);
  if (chainDisabled) return chainDisabled;

  try {
    // Audit-first, S3 fallback: use the S3 archive only when audit is not
    // configured for this chain or returns no rejected events.
    const auditTransactions = await getAuditRejectedTransactions(chain);
    const transactions =
      auditTransactions.length > 0 ? auditTransactions : await getS3RejectedTransactions(chain);

    const response: RejectedTransactionsResponse = { transactions };
    return Response.json(response);
  } catch (error) {
    console.error('Error fetching rejected transactions:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function getAuditRejectedTransactions(chain: TipsChain): Promise<RejectedTransaction[]> {
  const auditRpcUrl = getAuditRpcUrl(chain);
  if (!auditRpcUrl) {
    return [];
  }

  try {
    return (await getAuditRejectedTransactionEvents(auditRpcUrl, 100))
      .map(rejectedTransactionFromAuditEvent)
      .filter((tx): tx is RejectedTransaction => tx !== null);
  } catch (error) {
    console.error('Falling back to S3 rejected transactions:', error);
    return [];
  }
}

async function getS3RejectedTransactions(chain: TipsChain): Promise<RejectedTransaction[]> {
  const summaries = await listRejectedTransactions(chain, 100);
  const transactions = await Promise.all(
    summaries.map((summary) => getRejectedTransaction(chain, summary.blockNumber, summary.txHash)),
  );
  return transactions.filter((tx): tx is RejectedTransaction => tx !== null);
}
