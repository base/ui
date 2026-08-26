import { resolveExplorerChainFromRequest } from '../chain';
import { getRpcUrl } from '../config';
import { explorerDisabledResponse } from '../guard';
import {
  InvalidTransactionListQueryError,
  listTransactions,
  parseTransactionListQuery,
  TransactionListUnavailableError,
} from '../transaction-list';

export const runtime = 'nodejs';

// Cursor-paginated confirmed-transaction list, read directly from the execution
// RPC. See app/api/internal-explorer/transaction-list.ts. Types re-exported for the client.
export type { TransactionListItem, TransactionsResponse } from '../transaction-list';

export async function GET(request: Request) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveExplorerChainFromRequest(request);

  try {
    const query = parseTransactionListQuery(new URL(request.url).searchParams);
    return Response.json(await listTransactions(getRpcUrl(chain), query));
  } catch (error) {
    if (error instanceof InvalidTransactionListQueryError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error('Error fetching transaction list:', error);
    return Response.json(
      {
        error:
          error instanceof TransactionListUnavailableError
            ? 'Transaction list unavailable'
            : 'Internal server error',
      },
      { status: error instanceof TransactionListUnavailableError ? 503 : 500 },
    );
  }
}
