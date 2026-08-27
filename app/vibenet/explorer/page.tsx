'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Banner } from '../../components/ui/Banner';
import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import { ExplorerLink } from '../components/ExplorerLink';
import { ExplorerSearch } from '../components/ExplorerSearch';
import type { BlockRow, StatsRow, TxRow } from '../library/api-types';
import { vibenetApi } from '../library/client';
import { timeAgoFromMilliseconds, timeAgoFromSeconds } from '../library/explorer';

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
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [statHighlight, setStatHighlight] = useState<Set<string>>(new Set());

  const seenBlocks = useRef<Set<string>>(new Set());
  const seenTxs = useRef<Set<string>>(new Set());
  const lastStats = useRef<StatsRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let pollTimer: number | undefined;
    let rowHighlightTimer: number | undefined;
    let statHighlightTimer: number | undefined;
    const controller = new AbortController();

    function schedule() {
      if (cancelled || document.hidden) return;
      pollTimer = window.setTimeout(() => void load(), 1_000);
    }

    async function load() {
      if (cancelled || document.hidden || inFlight) return;
      inFlight = true;
      try {
        const [blocksRes, statsRes] = await Promise.all([
          vibenetApi.explorer.blocks(controller.signal),
          vibenetApi.explorer.stats(controller.signal),
        ]);
        if (cancelled) return;

        const nextBlocks = blocksRes.blocks ?? [];
        const nextTxs = blocksRes.txs ?? [];

        if (seenBlocks.current.size > 0) {
          const fresh = new Set<string>();
          nextBlocks.forEach((b) => {
            if (!seenBlocks.current.has(b.hash)) fresh.add(`block-${b.hash}`);
          });
          nextTxs.forEach((t) => {
            if (!seenTxs.current.has(t.hash)) fresh.add(`tx-${t.hash}`);
          });
          if (fresh.size > 0) {
            setNewKeys(fresh);
            window.clearTimeout(rowHighlightTimer);
            rowHighlightTimer = window.setTimeout(() => setNewKeys(new Set()), 450);
          }
          const changed = new Set<string>();
          const prev = lastStats.current;
          if (prev) {
            if (prev.blocks !== statsRes.blocks) changed.add('blocks');
            if (prev.txs !== statsRes.txs) changed.add('txs');
            if (prev.addresses !== statsRes.addresses) changed.add('addresses');
          }
          if (changed.size > 0) {
            setStatHighlight(changed);
            window.clearTimeout(statHighlightTimer);
            statHighlightTimer = window.setTimeout(() => setStatHighlight(new Set()), 450);
          }
        }

        seenBlocks.current = new Set(nextBlocks.map((b) => b.hash));
        seenTxs.current = new Set(nextTxs.map((t) => t.hash));
        lastStats.current = statsRes;

        setBlocks(nextBlocks);
        setTxs(nextTxs);
        setStats(statsRes);
        setFetchError(null);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setFetchError('Could not reach the explorer API. Retrying…');
          setLoading(false);
        }
      } finally {
        inFlight = false;
        schedule();
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        window.clearTimeout(pollTimer);
      } else if (!inFlight) {
        window.clearTimeout(pollTimer);
        void load();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void load();
    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(pollTimer);
      window.clearTimeout(rowHighlightTimer);
      window.clearTimeout(statHighlightTimer);
    };
  }, []);

  const statItems = stats
    ? [
        { key: 'blocks', label: 'Blocks', value: stats.blocks },
        { key: 'txs', label: 'Transactions', value: stats.txs },
        { key: 'addresses', label: 'Addresses', value: stats.addresses },
      ]
    : [];

  return (
    <div className="animate-in flex flex-col gap-8">
      {fetchError ? <Banner>{fetchError}</Banner> : null}

      <ExplorerSearch />

      {statItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {statItems.map((stat) => (
            <Card
              key={stat.key}
              className={cn(
                'bg-background p-4 transition-colors duration-300 motion-reduce:transition-none dark:bg-white/5',
                statHighlight.has(stat.key) && NEW_ROW_HIGHLIGHT,
              )}
            >
              <Text variant="label.medium" tone="muted">
                {stat.label}
              </Text>
              <Text variant="title2" className="mt-1">{stat.value.toLocaleString()}</Text>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 bg-background p-5 dark:bg-white/5">
          <Text variant="headline">Latest Blocks</Text>
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
        </Card>

        <Card className="flex flex-col gap-3 bg-background p-5 dark:bg-white/5">
          <Text variant="headline">Latest Transactions</Text>
          <TablePanel loading={loading} isEmpty={txs.length === 0} emptyText="No transactions yet">
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
        </Card>
      </div>
    </div>
  );
}
