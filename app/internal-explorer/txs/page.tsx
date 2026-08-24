'use client';

import { Suspense, useEffect, useState } from 'react';

import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Text } from '../../components/ui/Text';
import { ExplorerNav } from '../components/ExplorerNav';
import { TransactionTable, type TransactionTableItem } from '../components/ExplorerTables';
import { explorerApi } from '../library/client';
import type { TransactionListItem } from '../library/types';
import { useExplorerChain } from '../library/useExplorerChain';

const PAGE_LIMIT = 50;

function asTableItems(transactions: TransactionListItem[]): TransactionTableItem[] {
  return transactions.map((transaction) => ({
    hash: transaction.hash,
    blockNumber: transaction.blockNumber,
    transactionIndex: transaction.transactionIndex,
    blockTimestamp: transaction.blockTimestamp,
    from: transaction.from,
    to: transaction.to,
    input: transaction.input,
    value: transaction.value,
    transactionFee: transaction.transactionFee,
  }));
}

function TransactionsContent() {
  const { chain } = useExplorerChain();
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setTransactions([]);
    setNextCursor(null);

    explorerApi
      .txs(chain, { limit: PAGE_LIMIT }, controller.signal)
      .then((result) => {
        if (cancelled) return;
        setTransactions(result.transactions);
        setNextCursor(result.nextCursor);
      })
      .catch(() => {
        if (controller.signal.aborted || cancelled) return;
        setError('Failed to fetch transactions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [chain]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    setError(null);
    try {
      const result = await explorerApi.txs(chain, { cursor: nextCursor, limit: PAGE_LIMIT });
      setTransactions((current) => [...current, ...result.transactions]);
      setNextCursor(result.nextCursor);
    } catch {
      setError('Failed to fetch older transactions');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="animate-in flex flex-col gap-6">
      <ExplorerNav chain={chain} active="txs" />

      <div>
        <Text variant="title2">Transactions</Text>
        <Text variant="label.regular" tone="muted" className="mt-1">
          Browse confirmed Base transactions from newest to oldest.
        </Text>
      </div>

      {error ? (
        <Card className="border-bds-red-30 bg-bds-red-0 p-4 dark:border-bds-red-60 dark:bg-bds-red-90/20">
          <Text variant="label.regular" className="text-bds-red-70 dark:text-bds-red-20">
            {error}
          </Text>
        </Card>
      ) : null}

      <Card className="overflow-hidden bg-white dark:bg-white/5">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12">
            <Spinner className="text-base-blue" />
            <Text variant="label.regular" tone="muted">
              Loading transactions…
            </Text>
          </div>
        ) : (
          <TransactionTable
            transactions={asTableItems(transactions)}
            chain={chain}
            emptyMessage="No confirmed transactions found"
          />
        )}

        {!loading ? (
          <div className="flex items-center justify-between border-t border-bds-gray-10 px-4 py-3 dark:border-white/10">
            <span className="text-sm text-bds-gray-60 dark:text-bds-gray-40">
              {transactions.length.toLocaleString()} transactions loaded
            </span>
            {nextCursor ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm font-medium text-base-blue hover:underline disabled:cursor-wait disabled:opacity-50 dark:text-bds-blue-20"
              >
                {loadingMore ? 'Loading…' : 'Load older transactions →'}
              </button>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-3 py-16">
          <Spinner className="text-base-blue" />
          <Text variant="label.regular" tone="muted">
            Loading…
          </Text>
        </div>
      }
    >
      <TransactionsContent />
    </Suspense>
  );
}
