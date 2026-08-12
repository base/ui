'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Spinner } from '../../../components/ui/Spinner';
import { Text } from '../../../components/ui/Text';
import { CopyButton } from '../../components/CopyButton';
import { TipsExplorerLink } from '../../components/TipsExplorerLink';
import type { TipsChain } from '../../chains';
import { tipsApi, TipsApiError } from '../../library/client';
import { shortHash } from '../../library/format';
import { tipsHref } from '../../library/links';
import type { BlockDetailResponse, BlockDetailTransaction } from '../../library/types';
import { useTipsChain } from '../../library/useTipsChain';

interface PageProps {
  params: Promise<{ hash: string }>;
}

function executionTimeUs(tx: BlockDetailTransaction): number | null {
  return tx.metering?.transaction?.executionTimeUs ?? null;
}

function stateRootTimeUs(tx: BlockDetailTransaction): number | null {
  return tx.metering?.bundle?.stateRootTimeUs ?? null;
}

function gasUsed(tx: BlockDetailTransaction): number | null {
  return tx.metering?.transaction?.gasUsed ?? null;
}

// Amber→red heat scale for a tx's total metered time relative to the block max.
function heatmapClass(timeUs: number, maxTime: number): string {
  if (maxTime === 0) return 'bg-bds-yellow-0 text-bds-yellow-70';
  const ratio = Math.min(timeUs / maxTime, 1);
  if (ratio < 0.2) return 'bg-bds-yellow-5 text-bds-yellow-80';
  if (ratio < 0.4) return 'bg-bds-yellow-10 text-bds-yellow-90';
  if (ratio < 0.6) return 'bg-bds-orange-10 text-bds-orange-90';
  if (ratio < 0.8) return 'bg-bds-orange-15 text-bds-orange-90';
  return 'bg-bds-red-15 text-bds-red-90';
}

function TransactionRow({
  tx,
  chain,
  maxTotalTime,
}: {
  tx: BlockDetailTransaction;
  chain: TipsChain;
  maxTotalTime: number;
}) {
  const hasBundle = tx.bundleId !== null;
  const execTime = executionTimeUs(tx);
  const srTime = stateRootTimeUs(tx);
  const hasMetering = execTime !== null;
  const totalTime = (execTime ?? 0) + (srTime ?? 0);
  const txGasUsed = gasUsed(tx);
  const gasLimit = Number(tx.gasLimit);

  const content = (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3 transition-colors hover:bg-bds-gray-5/60 dark:hover:bg-white/5',
        hasBundle && 'cursor-pointer',
      )}
    >
      <div className="w-8 shrink-0 text-center text-xs font-medium text-bds-gray-60 dark:text-bds-gray-40">
        {tx.index}
      </div>
      <div className="min-w-0 flex-1">
        <TipsExplorerLink chain={chain} type="tx" value={tx.hash} className="break-all font-mono text-sm">
          {tx.hash}
        </TipsExplorerLink>
        <div className="mt-0.5 text-xs text-bds-gray-60 dark:text-bds-gray-40">
          {tx.from.slice(0, 6)}…{tx.from.slice(-4)}
          {tx.to ? (
            <>
              {' → '}
              {tx.to.slice(0, 6)}…{tx.to.slice(-4)}
            </>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {hasMetering ? (
          <span className={cn('inline-block rounded px-2 py-0.5 text-sm font-medium', heatmapClass(totalTime, maxTotalTime))}>
            {totalTime.toLocaleString()}μs
          </span>
        ) : (
          <div className="text-sm font-medium text-bds-gray-40">—</div>
        )}
        <div className="mt-0.5 text-xs text-bds-gray-60 dark:text-bds-gray-40">
          {txGasUsed != null
            ? `${txGasUsed.toLocaleString()} / ${gasLimit.toLocaleString()} gas`
            : `${gasLimit.toLocaleString()} gas limit`}
        </div>
      </div>
    </div>
  );

  if (hasBundle) {
    return <Link href={tipsHref(`/tips/bundles/${tx.bundleId}`, chain)}>{content}</Link>;
  }
  return content;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Text variant="footnote" tone="muted" className="mb-1">
        {label}
      </Text>
      <Text variant="title3" className="truncate">
        {value}
      </Text>
    </div>
  );
}

function BlockStats({ block }: { block: BlockDetailResponse }) {
  const metered = block.transactions.filter((tx) => executionTimeUs(tx) !== null);
  const totalExecTime = metered.reduce((sum, tx) => sum + (executionTimeUs(tx) ?? 0), 0);
  const totalSrTime = metered.reduce((sum, tx) => sum + (stateRootTimeUs(tx) ?? 0), 0);
  const bundleCount = block.transactions.filter((tx) => tx.bundleId !== null).length;

  return (
    <Card className="overflow-hidden bg-background dark:bg-white/5">
      <div className="p-5">
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-5">
          <StatCell label="Block Number" value={`#${Number(block.number).toLocaleString()}`} />
          <StatCell label="Transactions" value={block.transactions.length.toLocaleString()} />
          <StatCell label="Bundles" value={bundleCount.toLocaleString()} />
          <StatCell
            label="Total Exec Time"
            value={totalExecTime > 0 ? `${totalExecTime.toLocaleString()}μs` : '—'}
          />
          <StatCell
            label="Total State Root"
            value={totalSrTime > 0 ? `${totalSrTime.toLocaleString()}μs` : '—'}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 border-t border-bds-gray-10 bg-bds-gray-5/50 px-5 py-3 text-xs sm:grid-cols-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="min-w-0">
          <span className="text-bds-gray-60 dark:text-bds-gray-40">Gas Used</span>{' '}
          <span className="font-medium text-foreground">
            {Number(block.gasUsed).toLocaleString()}
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-bds-gray-60 dark:text-bds-gray-40">Gas Limit</span>{' '}
          <span className="font-medium text-foreground">
            {Number(block.gasLimit).toLocaleString()}
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-bds-gray-60 dark:text-bds-gray-40">Timestamp</span>{' '}
          <span className="font-medium text-foreground">
            {new Date(Number(block.timestamp) * 1000).toLocaleString()}
          </span>
        </div>
      </div>
    </Card>
  );
}

function BlockToolbar({
  chain,
  hash,
  block,
}: {
  chain: TipsChain;
  hash: string;
  block: BlockDetailResponse | null;
}) {
  const displayHash = block?.hash ?? hash;
  const blockNumber = block ? Number(block.number) : null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={tipsHref('/tips', chain)}
          className="text-sm text-base-blue hover:underline"
        >
          ← TIPS
        </Link>
        {blockNumber !== null ? (
          <>
            <span className="text-bds-gray-30">/</span>
            {blockNumber > 0 ? (
              <Link
                href={tipsHref(`/tips/block/${blockNumber - 1}`, chain)}
                className="rounded-md px-2 py-1 text-sm text-bds-gray-60 transition-colors hover:bg-bds-gray-5 hover:text-foreground dark:text-bds-gray-40 dark:hover:bg-white/10 dark:hover:text-white"
                title="Previous block"
              >
                ← Prev
              </Link>
            ) : (
              <span className="cursor-not-allowed px-2 py-1 text-sm text-bds-gray-30">← Prev</span>
            )}
            <Link
              href={tipsHref(`/tips/block/${blockNumber + 1}`, chain)}
              className="rounded-md px-2 py-1 text-sm text-bds-gray-60 transition-colors hover:bg-bds-gray-5 hover:text-foreground dark:text-bds-gray-40 dark:hover:bg-white/10 dark:hover:text-white"
              title="Next block"
            >
              Next →
            </Link>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <code className="rounded bg-bds-gray-5 px-2 py-1 font-mono text-xs text-bds-gray-60 dark:bg-white/5 dark:text-bds-gray-40">
          {shortHash(displayHash)}
        </code>
        <CopyButton text={displayHash} />
        <TipsExplorerLink chain={chain} type="block" value={displayHash} className="rounded-md p-1.5 text-bds-gray-50 hover:bg-bds-gray-5 hover:text-foreground dark:hover:bg-white/10 dark:hover:text-white">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <title>View on block explorer</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </TipsExplorerLink>
      </div>
    </div>
  );
}

function BlockContent({ params }: PageProps) {
  const { chain } = useTipsChain();
  const [hash, setHash] = useState('');
  const [data, setData] = useState<BlockDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void params.then((p) => setHash(p.hash));
  }, [params]);

  useEffect(() => {
    if (!hash) return;
    let cancelled = false;
    setData(null);
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const next = await tipsApi.block(hash, chain);
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof TipsApiError && err.status === 404
            ? 'Block not found'
            : 'Failed to fetch block data',
        );
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [hash, chain]);

  if (!hash || loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner className="text-base-blue" />
        <Text variant="label.regular" tone="muted">
          Loading block…
        </Text>
      </div>
    );
  }

  const maxTotalTime = data
    ? Math.max(
        0,
        ...data.transactions
          .filter((tx) => executionTimeUs(tx) !== null)
          .map((tx) => (executionTimeUs(tx) ?? 0) + (stateRootTimeUs(tx) ?? 0)),
      )
    : 0;

  return (
    <div className="animate-in flex flex-col gap-6">
      <BlockToolbar chain={chain} hash={hash} block={data} />

      {error ? (
        <EmptyState title="Error" description={error} />
      ) : null}

      {data ? (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-4">
            <Text variant="headline">Block Overview</Text>
            <BlockStats block={data} />
          </section>

          <section className="flex flex-col gap-4">
            <Text variant="headline">Transactions</Text>
            <Card className="overflow-hidden bg-background dark:bg-white/5">
              <div className="flex items-center gap-4 border-b border-bds-gray-10 bg-bds-gray-5/60 px-4 py-2 text-xs font-medium text-bds-gray-60 dark:border-white/10 dark:bg-white/[0.03] dark:text-bds-gray-40">
                <div className="w-8 text-center">#</div>
                <div className="flex-1">Transaction</div>
                <div className="text-right">Execution</div>
              </div>
              {data.transactions.length > 0 ? (
                <div className="divide-y divide-bds-gray-10 dark:divide-white/10">
                  {data.transactions.map((tx) => (
                    <TransactionRow key={tx.hash} tx={tx} chain={chain} maxTotalTime={maxTotalTime} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  bordered={false}
                  className="py-12 text-center"
                  description="No transactions in this block"
                />
              )}
            </Card>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function BlockPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-3 py-16">
          <Spinner className="text-base-blue" />
          <Text variant="label.regular" tone="muted">
            Loading block…
          </Text>
        </div>
      }
    >
      <BlockContent params={params} />
    </Suspense>
  );
}
