'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { Tabs } from '../components/ui/Tabs';
import { Text } from '../components/ui/Text';
import { ChainToggle } from './components/ChainToggle';
import { MeteringCard } from './components/MeteringCard';
import type { TipsChain } from './chains';
import { tipsApi } from './library/client';
import {
  calculateShadowDelta,
  formatSignedGas,
  formatSignedInteger,
  formatSignedPct,
} from './library/explorer-format';
import { formatGasPrice, formatHexValue, shortHash, timeAgoFromSeconds } from './library/format';
import { tipsHref } from './library/links';
import {
  formatRejectionReason,
  type BlockSummary,
  type RejectedTransaction,
  type ShadowBlockSummary,
} from './library/types';
import { useTipsChain } from './library/useTipsChain';

type Tab = 'blocks' | 'rejected';

// --- Search ---------------------------------------------------------------

function SearchBar({ chain, onError }: { chain: TipsChain; onError: (error: string | null) => void }) {
  const router = useRouter();
  const [searchHash, setSearchHash] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const hash = searchHash.trim();
    if (!hash) return;

    // The transaction detail page is now the canonical, multi-source view (it
    // resolves audit + on-chain + archive data itself and works even when the
    // transaction is not part of a bundle), so route straight to it.
    setLoading(true);
    onError(null);
    router.push(tipsHref(`/tips/txn/${hash}`, chain));
  };

  return (
    <form onSubmit={handleSearch} className="relative w-full">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title>Search</title>
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <input
        type="text"
        placeholder="Search by transaction hash…"
        aria-label="Search by transaction hash"
        value={searchHash}
        onChange={(e) => setSearchHash(e.target.value)}
        disabled={loading}
        spellCheck={false}
        autoComplete="off"
        className={cn(
          'w-full rounded-full border border-bds-gray-10 bg-bds-gray-0 py-3 pl-9 font-sans text-sm text-foreground outline-none transition-colors placeholder:text-bds-gray-40 focus:border-foreground dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-bds-blue-40',
          searchHash.trim() ? 'pr-24' : 'pr-3.5',
        )}
      />
      {searchHash.trim() ? (
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="absolute right-1.5 top-1/2 -translate-y-1/2"
        >
          {loading ? '…' : 'Search'}
        </Button>
      ) : null}
    </form>
  );
}

// --- Blocks ---------------------------------------------------------------

function BlockRow({
  block,
  chain,
  showShadowDelta,
  shadowBlock,
}: {
  block: BlockSummary;
  chain: TipsChain;
  showShadowDelta: boolean;
  shadowBlock?: ShadowBlockSummary;
}) {
  const delta = shadowBlock ? calculateShadowDelta(block.gasUsed, block.transactionCount, shadowBlock) : null;
  const gasDiffPct = delta?.gasDiffPct;
  const gasDiffAbs = delta?.gasDiffAbs;
  const txDiffAbs = delta?.txDiffAbs;
  const txDiffPct = delta?.txDiffPct;
  const hasGasDelta = gasDiffAbs !== undefined;
  const gasDeltaClass =
    gasDiffPct !== undefined && Math.abs(gasDiffPct) > 50
      ? 'text-bds-red-70 dark:text-bds-red-20'
      : 'text-foreground';
  const gasDeltaText =
    gasDiffAbs !== undefined
      ? `${gasDiffPct !== undefined ? `${formatSignedPct(gasDiffPct)} ` : ''}(${formatSignedGas(
          gasDiffAbs,
        )})`
      : '—';
  const txDeltaText =
    txDiffAbs !== undefined
      ? `${txDiffPct !== undefined ? `${formatSignedPct(txDiffPct)} ` : ''}(${formatSignedInteger(
          txDiffAbs,
        )})`
      : '—';

  return (
    <Link
      href={tipsHref(`/tips/block/${block.hash}`, chain)}
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-bds-gray-5/60 dark:hover:bg-white/5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bds-blue-0">
        <svg
          className="h-5 w-5 text-base-blue"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>Block</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Text as="span" variant="label" className="font-semibold">
            #{block.number.toLocaleString()}
          </Text>
          <span className="text-xs text-bds-gray-50">{timeAgoFromSeconds(block.timestamp)}</span>
        </div>
        <div className="truncate font-mono text-xs text-bds-gray-60 dark:text-bds-gray-40">
          {block.hash}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <Text as="span" variant="label" className="block font-medium">
          {block.transactionCount}
        </Text>
        <span className="text-xs text-bds-gray-60 dark:text-bds-gray-40">txns</span>
      </div>
      {showShadowDelta ? (
        <div className="shrink-0 text-right">
          <div className="text-xs text-bds-gray-50 dark:text-bds-gray-40">Gas Δ</div>
          <div
            className={cn(
              'whitespace-nowrap text-sm font-medium',
              hasGasDelta ? gasDeltaClass : 'text-bds-gray-60 dark:text-bds-gray-40',
            )}
          >
            {hasGasDelta ? gasDeltaText : '—'}
          </div>
          <div className="mt-1 text-xs text-bds-gray-50 dark:text-bds-gray-40">Tx Δ</div>
          <div className="whitespace-nowrap text-xs text-bds-gray-60 dark:text-bds-gray-40">
            {txDeltaText}
          </div>
        </div>
      ) : null}
      <svg
        className="h-4 w-4 shrink-0 text-bds-gray-40"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <title>View</title>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function BlocksTab({ chain }: { chain: TipsChain }) {
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showShadowDelta, setShowShadowDelta] = useState(false);
  const [shadowCandidates, setShadowCandidates] = useState<Record<string, ShadowBlockSummary[]>>({});
  const shadowKey = useMemo(
    () => blocks.map((block) => block.hash.toLowerCase()).sort().join(','),
    [blocks],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const data = await tipsApi.blocks(chain);
        if (!cancelled) setBlocks(data.blocks);
      } catch {
        // Transient errors are expected between polls; keep the last good data.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chain]);

  useEffect(() => {
    if (!showShadowDelta || shadowKey.length === 0) {
      setShadowCandidates({});
      return undefined;
    }

    const controller = new AbortController();
    const hashes = shadowKey.split(',');

    tipsApi
      .shadowCandidatesBatch(chain, hashes, controller.signal)
      .then((response) => setShadowCandidates(response))
      .catch(() => setShadowCandidates({}));

    return () => {
      controller.abort();
    };
  }, [chain, shadowKey, showShadowDelta]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text variant="headline">Latest Blocks</Text>
        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-bds-gray-60 dark:text-bds-gray-40">
          <input
            type="checkbox"
            checked={showShadowDelta}
            onChange={(event) => setShowShadowDelta(event.target.checked)}
            className="h-4 w-4 accent-base-blue"
          />
          Show shadow Δ
        </label>
      </div>
      <Card className="overflow-hidden bg-background dark:bg-white/5">
        {loading && blocks.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12">
            <Spinner className="text-base-blue" />
            <Text variant="label.regular" tone="muted">
              Loading blocks…
            </Text>
          </div>
        ) : blocks.length > 0 ? (
          <div className="divide-y divide-bds-gray-10 dark:divide-white/10">
            {blocks.map((block) => (
                <BlockRow
                  key={block.hash}
                  block={block}
                  chain={chain}
                  showShadowDelta={showShadowDelta}
                  shadowBlock={shadowCandidates[block.hash.toLowerCase()]?.[0]}
                />
              ))}
          </div>
        ) : (
          <EmptyState bordered={false} className="py-12 text-center" description="No blocks available" />
        )}
      </Card>
    </section>
  );
}

// --- Rejected transactions ------------------------------------------------

const HEAD_CELL = 'px-4 py-2 text-left text-xs font-medium text-bds-gray-60 dark:text-bds-gray-40';
const BODY_CELL = 'px-4 py-2.5 text-xs';

function RejectedTxRow({
  tx,
  chain,
  expanded,
  onToggle,
}: {
  tx: RejectedTransaction;
  chain: TipsChain;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-bds-gray-5/60 dark:hover:bg-white/5"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bds-red-0">
          <svg
            className="h-5 w-5 text-bds-red-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Rejected</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-sm text-foreground">{tx.txHash}</span>
            <span className="inline-flex items-center rounded-full bg-bds-red-0 px-2 py-0.5 text-xs font-medium text-bds-red-70 ring-1 ring-inset ring-bds-red-20">
              Rejected
            </span>
            <span className="text-xs text-bds-gray-50">{timeAgoFromSeconds(tx.timestamp)}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-bds-gray-60 dark:text-bds-gray-40">
            Block #{tx.blockNumber.toLocaleString()} — {formatRejectionReason(tx.reason)}
          </div>
        </div>
        <svg
          className={cn('h-5 w-5 shrink-0 text-bds-gray-40 transition-transform', expanded && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>{expanded ? 'Collapse' : 'Expand'}</title>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded ? (
        <div className="space-y-4 px-4 pb-4">
          <div className="rounded-lg bg-bds-gray-5 p-4 dark:bg-white/5">
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-bds-gray-10 dark:border-white/10">
                  <td className="w-28 py-2 text-bds-gray-60 dark:text-bds-gray-40">Transaction</td>
                  <td className="break-all py-2 font-mono text-foreground">{tx.txHash}</td>
                </tr>
                <tr className="border-b border-bds-gray-10 dark:border-white/10">
                  <td className="py-2 text-bds-gray-60 dark:text-bds-gray-40">Block</td>
                  <td className="py-2 font-medium text-foreground">
                    #{tx.blockNumber.toLocaleString()}
                  </td>
                </tr>
                <tr className="border-b border-bds-gray-10 dark:border-white/10">
                  <td className="py-2 text-bds-gray-60 dark:text-bds-gray-40">Reason</td>
                  <td className="py-2 font-medium text-bds-red-70">
                    {formatRejectionReason(tx.reason)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-bds-gray-60 dark:text-bds-gray-40">Rejected At</td>
                  <td className="py-2 text-foreground">
                    {new Date(tx.timestamp * 1000).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <Text as="span" variant="caption" tone="muted" className="mb-2">
              Metering Results
            </Text>
            <MeteringCard meter={tx.metering} />
          </div>

          {tx.metering.results.length > 0 ? (
            <div>
              <Text as="span" variant="caption" tone="muted" className="mb-2">
                Per-Transaction Breakdown
              </Text>
              <Card className="overflow-x-auto bg-background dark:bg-white/5">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="border-b border-bds-gray-10 bg-bds-gray-5/60 dark:border-white/10 dark:bg-white/[0.03]">
                      <th className={HEAD_CELL}>Tx Hash</th>
                      <th className={HEAD_CELL}>From</th>
                      <th className={cn(HEAD_CELL, 'text-right')}>Gas Used</th>
                      <th className={cn(HEAD_CELL, 'text-right')}>Exec Time</th>
                      <th className={cn(HEAD_CELL, 'text-right')}>Gas Price</th>
                      <th className={cn(HEAD_CELL, 'text-right')}>Gas Fees</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bds-gray-10 dark:divide-white/10">
                    {tx.metering.results.map((result) => (
                      <tr key={result.txHash} className="hover:bg-bds-gray-5/60 dark:hover:bg-white/5">
                        <td className={cn(BODY_CELL, 'font-mono text-foreground')}>
                          {result.txHash.slice(0, 10)}…{result.txHash.slice(-6)}
                        </td>
                        <td className={cn(BODY_CELL, 'font-mono text-bds-gray-60 dark:text-bds-gray-40')}>
                          {result.fromAddress.slice(0, 8)}…{result.fromAddress.slice(-4)}
                        </td>
                        <td className={cn(BODY_CELL, 'text-right font-medium text-foreground')}>
                          {result.gasUsed.toLocaleString()}
                        </td>
                        <td className={cn(BODY_CELL, 'text-right font-medium text-foreground')}>
                          {result.executionTimeUs.toLocaleString()}μs
                        </td>
                        <td className={cn(BODY_CELL, 'text-right text-bds-gray-70')}>
                          {formatGasPrice(result.gasPrice)}
                        </td>
                        <td className={cn(BODY_CELL, 'text-right text-bds-gray-70')}>
                          {formatHexValue(result.gasFees)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RejectedTransactionsTab({ chain }: { chain: TipsChain }) {
  const [transactions, setTransactions] = useState<RejectedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [txHashFilter, setTxHashFilter] = useState('');
  const [blockNumberFilter, setBlockNumberFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const data = await tipsApi.rejected(chain);
        if (!cancelled) setTransactions(data.transactions);
      } catch {
        // Keep last good data across transient poll failures.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chain]);

  const filtered = transactions.filter((tx) => {
    if (txHashFilter && !tx.txHash.toLowerCase().includes(txHashFilter.toLowerCase())) {
      return false;
    }
    if (blockNumberFilter) {
      const blockNum = Number.parseInt(blockNumberFilter, 10);
      if (!Number.isNaN(blockNum) && tx.blockNumber !== blockNum) return false;
    }
    return true;
  });

  const inputClass =
    'rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-bds-gray-40 focus:border-foreground dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-bds-blue-40';

  return (
    <section className="flex flex-col gap-4">
      <Banner>
        <span className="font-semibold">About rejected transactions:</span> These are transactions
        that violated per-transaction resource metering budgets (execution time or state root gas
        limits). They would have <span className="font-semibold">never</span> been considered for
        block inclusion and were rejected during the block building process.
      </Banner>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Text variant="headline">Rejected Transactions</Text>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Filter by tx hash…"
            aria-label="Filter by tx hash"
            value={txHashFilter}
            onChange={(e) => {
              setTxHashFilter(e.target.value);
              setExpandedIdx(null);
            }}
            className={cn(inputClass, 'w-full sm:w-56')}
          />
          <input
            type="text"
            placeholder="Block number…"
            aria-label="Filter by block number"
            value={blockNumberFilter}
            onChange={(e) => {
              setBlockNumberFilter(e.target.value);
              setExpandedIdx(null);
            }}
            className={cn(inputClass, 'w-full sm:w-32')}
          />
          {txHashFilter || blockNumberFilter ? (
            <button
              type="button"
              onClick={() => {
                setTxHashFilter('');
                setBlockNumberFilter('');
                setExpandedIdx(null);
              }}
              className="px-2 py-1.5 text-xs text-bds-gray-60 transition-colors hover:text-foreground dark:text-bds-gray-40 dark:hover:text-white"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden bg-background dark:bg-white/5">
        {loading && transactions.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12">
            <Spinner className="text-bds-red-50" />
            <Text variant="label.regular" tone="muted">
              Loading rejected transactions…
            </Text>
          </div>
        ) : filtered.length > 0 ? (
          <div className="divide-y divide-bds-gray-10 dark:divide-white/10">
            {filtered.map((tx, index) => (
              <RejectedTxRow
                key={`${tx.blockNumber}-${tx.txHash}`}
                tx={tx}
                chain={chain}
                expanded={expandedIdx === index}
                onToggle={() => setExpandedIdx(expandedIdx === index ? null : index)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            bordered={false}
            className="py-12 text-center"
            title={
              transactions.length > 0
                ? 'No transactions match the current filters'
                : 'No rejected transactions found'
            }
            description={
              transactions.length > 0
                ? 'Try adjusting your search criteria'
                : 'Transactions that violate metering budgets will appear here'
            }
          />
        )}
      </Card>
    </section>
  );
}

// --- Page shell -----------------------------------------------------------

function TipsDashboard() {
  const { chain } = useTipsChain();
  const [activeTab, setActiveTab] = useState<Tab>('blocks');
  const [error, setError] = useState<string | null>(null);

  // Support the #rejected deep-link on first load.
  useEffect(() => {
    if (window.location.hash.replace('#', '') === 'rejected') {
      setActiveTab('rejected');
    }
  }, []);

  const switchTab = useCallback((tab: string) => {
    setActiveTab(tab as Tab);
    setError(null);
  }, []);

  return (
    <div className="animate-in flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          ariaLabel="TIPS view"
          value={activeTab}
          onChange={switchTab}
          items={[
            { value: 'blocks', label: 'Blocks' },
            { value: 'rejected', label: 'Rejected Transactions' },
          ]}
        />
        <ChainToggle />
      </div>

      {activeTab === 'blocks' ? <SearchBar chain={chain} onError={setError} /> : null}

      {activeTab === 'blocks' ? (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link
            href={tipsHref('/tips/blocks', chain)}
            className="text-base-blue hover:underline dark:text-bds-blue-20"
          >
            All blocks →
          </Link>
          <Link
            href={tipsHref('/tips/txs', chain)}
            className="text-base-blue hover:underline dark:text-bds-blue-20"
          >
            All transactions →
          </Link>
        </div>
      ) : null}

      {error && activeTab === 'blocks' ? (
        <div className="flex items-center gap-3 rounded-lg border border-bds-red-20 bg-bds-red-0 px-3.5 py-2.5 text-[13px] text-bds-red-70">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-bds-red-60 hover:text-bds-red-80"
            aria-label="Dismiss error"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <title>Dismiss</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : null}

      {activeTab === 'blocks' ? <BlocksTab chain={chain} /> : <RejectedTransactionsTab chain={chain} />}
    </div>
  );
}

export default function TipsPage() {
  // useTipsChain reads useSearchParams; wrap in Suspense per Next 15 App Router.
  return (
    <Suspense fallback={<TipsDashboardFallback />}>
      <TipsDashboard />
    </Suspense>
  );
}

function TipsDashboardFallback() {
  return (
    <div className="flex items-center justify-center gap-3 py-16">
      <Spinner className="text-base-blue" />
      <Text variant="label.regular" tone="muted">
        Loading…
      </Text>
    </div>
  );
}
