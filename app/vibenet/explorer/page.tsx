'use client';

import type { ReactNode } from 'react';

import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { ExplorerLink } from '../components/ExplorerLink';
import { ExplorerSearch } from '../components/ExplorerSearch';
import { timeAgoFromMilliseconds, timeAgoFromSeconds } from '../library/explorer';
import { useLiveExplorer } from './useLiveExplorer';
import { LiveTable } from './LiveTable';

const NEW_ROW_HIGHLIGHT = 'bg-bds-blue-0';
const TH =
  'px-4 py-3 text-left text-sm font-normal text-bds-gray-50 first:pl-0 last:pr-0';
const TD = 'px-4 py-3 text-sm first:pl-0 last:pr-0';

type TablePanelProps = {
  loading: boolean;
  isEmpty: boolean;
  emptyText: string;
  children: ReactNode;
};

// Wraps a live table, showing loading / empty states without a nested ternary.
function TablePanel({ loading, isEmpty, emptyText, children }: TablePanelProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3 py-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <Text variant="label.regular" tone="muted" className="py-4">
        {emptyText}
      </Text>
    );
  }
  return <>{children}</>;
}

export default function ExplorerPage() {
  const { blocks, txs, stats, loading, status, newKeys, pauses, dispatchPause } = useLiveExplorer();

  const statItems = [
    { key: 'blocks', label: 'Indexed blocks', value: stats?.blocks },
    { key: 'txs', label: 'Indexed transactions', value: stats?.txs },
    { key: 'addresses', label: 'Indexed addresses', value: stats?.addresses },
  ];

  return (
    <div className="animate-in flex flex-col gap-8">

      <ExplorerSearch />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statItems.map((stat) => (
          <Card key={stat.key} className="bg-background p-4 dark:bg-white/5">
            <Text variant="label.medium" tone="muted">
              {stat.label}
            </Text>
            <Text variant="title2" className="mt-1">{stat.value?.toLocaleString() ?? '—'}</Text>
          </Card>
        ))}
      </div>

      <section
        aria-label="Live explorer lists"
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
      >
        <LiveTable
          title="Latest Blocks"
          pause={pauses.blocks}
          status={status}
          onPauseChange={(action) => dispatchPause('blocks', action)}
        >
          <TablePanel loading={loading} isEmpty={blocks.length === 0} emptyText="No blocks yet">
            <table className="w-full border-collapse">
              <thead>
                <tr
                  aria-label="Column headers"
                  className="border-b border-bds-gray-10 dark:border-white/10"
                >
                  <th className={TH}>Block</th>
                  <th className={cn(TH, 'text-right')}>Txs</th>
                  <th className={cn(TH, 'text-right')}>Age</th>
                </tr>
              </thead>
              <tbody>
                {blocks.slice(0, 10).map((b) => (
                  <tr
                    key={b.hash}
                    aria-label={`Block ${b.number}`}
                    className={cn(
                      'border-b border-bds-gray-10 transition-colors duration-300 motion-reduce:transition-none last:border-0 hover:bg-bds-gray-5/50 dark:border-white/10',
                      newKeys.has(`block-${b.hash}`) && NEW_ROW_HIGHLIGHT,
                    )}
                  >
                    <td className={TD}>
                      <ExplorerLink kind="block" value={b.hash} label={b.number.toLocaleString()} />
                    </td>
                    <td className={cn(TD, 'text-right')}>{b.tx_count}</td>
                    <td
                      className={cn(
                        TD,
                        'whitespace-nowrap text-right text-bds-gray-60 dark:text-bds-gray-40',
                      )}
                    >
                      {b.timestamp_ms != null
                        ? timeAgoFromMilliseconds(b.timestamp_ms)
                        : timeAgoFromSeconds(b.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablePanel>
        </LiveTable>

        <LiveTable
          title="Latest Transactions"
          pause={pauses.txs}
          status={status}
          onPauseChange={(action) => dispatchPause('txs', action)}
        >
          <TablePanel loading={loading} isEmpty={txs.length === 0} emptyText="No transactions in the latest blocks">
            {/* Desktop table */}
            <table className="hidden w-full border-collapse sm:table">
              <thead>
                <tr
                  aria-label="Column headers"
                  className="border-b border-bds-gray-10 dark:border-white/10"
                >
                  <th className={TH}>Hash</th>
                  <th className={TH}>From</th>
                  <th className={TH}>To</th>
                  <th className={cn(TH, 'text-right')}>Block</th>
                </tr>
              </thead>
              <tbody>
                {txs.slice(0, 10).map((tx) => (
                  <tr
                    key={tx.hash}
                    aria-label={`Transaction ${tx.hash}`}
                    className={cn(
                      'border-b border-bds-gray-10 transition-colors duration-300 motion-reduce:transition-none last:border-0 hover:bg-bds-gray-5/50 dark:border-white/10',
                      newKeys.has(`tx-${tx.hash}`) && NEW_ROW_HIGHLIGHT,
                    )}
                  >
                    <td className={TD}>
                      <ExplorerLink kind="tx" value={tx.hash} />
                    </td>
                    <td className={TD}>
                      <ExplorerLink kind="address" value={tx.from_addr} />
                    </td>
                    <td className={TD}>
                      {tx.to_addr ? (
                        <ExplorerLink kind="address" value={tx.to_addr} />
                      ) : (
                        <span className="italic text-bds-gray-60 dark:text-bds-gray-40">
                          (create)
                        </span>
                      )}
                    </td>
                    <td className={cn(TD, 'text-right')}>
                      <ExplorerLink
                        kind="block"
                        value={String(tx.block_num)}
                        label={tx.block_num.toLocaleString()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile stacked */}
            <div className="flex flex-col sm:hidden">
              {txs.slice(0, 10).map((tx) => (
                <div
                  key={tx.hash}
                  className={cn(
                    'flex flex-col gap-1.5 border-b border-bds-gray-10 px-1 py-3 transition-colors duration-300 motion-reduce:transition-none last:border-0 dark:border-white/10',
                    newKeys.has(`tx-${tx.hash}`) && NEW_ROW_HIGHLIGHT,
                  )}
                >
                  <div className="flex items-center justify-between">
                    <ExplorerLink kind="tx" value={tx.hash} />
                    <span className="text-sm text-bds-gray-60 dark:text-bds-gray-40">
                      Block{' '}
                      <ExplorerLink
                        kind="block"
                        value={String(tx.block_num)}
                        label={tx.block_num.toLocaleString()}
                      />
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-bds-gray-60 dark:text-bds-gray-40">
                    <ExplorerLink kind="address" value={tx.from_addr} />
                    <span>→</span>
                    {tx.to_addr ? (
                      <ExplorerLink kind="address" value={tx.to_addr} />
                    ) : (
                      <span className="italic">(create)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TablePanel>
        </LiveTable>
      </section>
    </div>
  );
}
