import { resolveExplorerChainFromRequest } from '../chain';
import {
  getAuditRejectedTransactionEvents,
  rejectedTransactionFromAuditEvent,
} from '../audit-events';
import { getAuditRpcUrl } from '../config';
import { explorerDisabledResponse } from '../guard';
import type { RejectedTransaction } from '../transaction-data';

export const runtime = 'nodejs';

export interface RejectedTransactionsResponse {
  transactions: RejectedTransaction[];
}

export async function GET(request: Request) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveExplorerChainFromRequest(request);

  // Rejected transactions come only from the audit events RPC (Postgres-backed).
  // With no audit endpoint configured for this chain there is nothing to list.
  const auditRpcUrl = getAuditRpcUrl(chain);
  if (!auditRpcUrl) {
    const response: RejectedTransactionsResponse = { transactions: [] };
    return Response.json(response);
  }

  try {
    const transactions = (await getAuditRejectedTransactionEvents(auditRpcUrl, 100))
      .map(rejectedTransactionFromAuditEvent)
      .filter((tx): tx is RejectedTransaction => tx !== null);

    const response: RejectedTransactionsResponse = { transactions };
    return Response.json(response);
  } catch (error) {
    console.error('Error fetching rejected transactions from audit RPC:', error);
    return Response.json({ error: 'Audit RPC unavailable' }, { status: 502 });
  }
}
