'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Banner } from '../../components/ui/Banner';
import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { ExplorerLink } from '../components/ExplorerLink';
import type { BlockRow, StatsRow, TxRow } from '../library/api-types';
import { vibenetApi } from '../library/client';
import { timeAgoFromSeconds } from '../library/explorer';

const NEW_ROW_HIGHLIGHT = 'bg-bds-blue-0 dark:bg-bds-blue-100/30';
const TH =
  'px-4 py-3 text-left text-[13px] font-normal text-bds-gray-50';
const TD = 'px-4 py-3 text-[13px]';

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
      <Text variant="label.regular" tone="muted" className="py-4">
        Indexing…
      </Text>
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

    async function load() {
      try {
        const [blocksRes, statsRes] = await Promise.all([
          vibenetApi.explorer.blocks(),
          vibenetApi.explorer.stats(),
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
            window.setTimeout(() => setNewKeys(new Set()), 1300);
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
            window.setTimeout(() => setStatHighlight(new Set()), 1000);
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
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
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
    <div className="flex flex-col gap-8">
      {fetchError ? <Banner>{fetchError}</Banner> : null}

      {statItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {statItems.map((stat) => (
            <Card
              key={stat.key}
              className={cn(
                'bg-white p-4 transition-colors duration-700 dark:bg-white/5',
                statHighlight.has(stat.key) && NEW_ROW_HIGHLIGHT,
              )}
            >
              <Text variant="caption" tone="muted">
                {stat.label}
              </Text>
              <Text variant="title2" className="mt-1">{stat.value.toLocaleString()}</Text>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <Text variant="title3">Latest Blocks</Text>
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
                      'border-b border-bds-gray-10 transition-colors duration-1000 last:border-0 hover:bg-bds-gray-5/50 dark:border-white/10',
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
                      {timeAgoFromSeconds(b.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablePanel>
        </section>

        <section className="flex flex-col gap-3">
          <Text variant="title3">Latest Transactions</Text>
          <TablePanel loading={loading} isEmpty={txs.length === 0} emptyText="No transactions yet">
            <table className="w-full border-collapse">
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
                      'border-b border-bds-gray-10 transition-colors duration-1000 last:border-0 hover:bg-bds-gray-5/50 dark:border-white/10',
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
          </TablePanel>
        </section>
      </div>
    </div>
  );
}
