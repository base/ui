'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Spinner } from '../../../components/ui/Spinner';
import { Text } from '../../../components/ui/Text';
import { CopyButton } from '../../components/CopyButton';
import { MeteringCard } from '../../components/MeteringCard';
import { TipsExplorerLink } from '../../components/TipsExplorerLink';
import type { TipsChain } from '../../chains';
import { tipsApi, TipsApiError } from '../../library/client';
import { formatGasPrice, formatHexValue, shortHash } from '../../library/format';
import { tipsHref } from '../../library/links';
import type { BundleEvent, BundleHistoryResponse, BundleTransaction } from '../../library/types';
import { useTipsChain } from '../../library/useTipsChain';

interface PageProps {
  params: Promise<{ hash: string }>;
}

type BadgeVariant = 'default' | 'success' | 'warning' | 'error';

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-bds-blue-0 text-bds-blue-70 ring-bds-blue-20 dark:text-base-blue',
  success:
    'bg-bds-green-0 text-bds-green-70 ring-bds-green-20',
  warning:
    'bg-bds-yellow-0 text-bds-yellow-70 ring-bds-yellow-20',
  error: 'bg-bds-red-0 text-bds-red-70 ring-bds-red-20',
};

function Badge({ children, variant = 'default' }: { children: ReactNode; variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        BADGE_VARIANTS[variant],
      )}
    >
      {children}
    </span>
  );
}

function TransactionDetails({
  tx,
  chain,
  index,
}: {
  tx: BundleTransaction;
  chain: TipsChain;
  index: number;
}) {
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <Card className="overflow-hidden bg-background dark:bg-white/5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-bds-gray-5/60 dark:hover:bg-white/5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bds-gray-5 text-sm font-medium text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-40">
            {index + 1}
          </div>
          <div className="min-w-0 text-left">
            <span className="font-mono text-sm text-foreground">{shortHash(tx.hash)}</span>
            <div className="mt-0.5 truncate text-xs text-bds-gray-60 dark:text-bds-gray-40">
              {tx.signer.slice(0, 6)}…{tx.signer.slice(-4)} →{' '}
              {tx.to ? `${tx.to.slice(0, 6)}…${tx.to.slice(-4)}` : 'Contract Creation'}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">
              {Number.parseInt(tx.gas, 16).toLocaleString()} gas
            </div>
            <div className="text-xs text-bds-gray-60 dark:text-bds-gray-40">
              {formatHexValue(tx.value)}
            </div>
          </div>
          <svg
            className={cn('h-5 w-5 text-bds-gray-40 transition-transform', expanded && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>{expanded ? 'Collapse' : 'Expand'}</title>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded ? (
        <>
          <div className="border-t border-bds-gray-10 px-5 pb-4 dark:border-white/10">
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-bds-gray-10 dark:border-white/10">
                  <td className="w-20 py-2 align-top text-bds-gray-60 dark:text-bds-gray-40">Hash</td>
                  <td className="py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <Link
                        href={tipsHref(`/tips/txn/${tx.hash}`, chain)}
                        className="break-all font-mono text-base-blue hover:underline dark:text-bds-blue-20"
                      >
                        {tx.hash}
                      </Link>
                      <TipsExplorerLink
                        chain={chain}
                        type="tx"
                        value={tx.hash}
                        className="shrink-0 text-bds-gray-50 hover:text-black dark:hover:text-white"
                      >
                        ↗
                      </TipsExplorerLink>
                      <CopyButton text={tx.hash} />
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-bds-gray-10 dark:border-white/10">
                  <td className="py-2 align-top text-bds-gray-60 dark:text-bds-gray-40">From</td>
                  <td className="py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <TipsExplorerLink chain={chain} type="address" value={tx.signer} className="break-all font-mono">
                        {tx.signer}
                      </TipsExplorerLink>
                      <CopyButton text={tx.signer} />
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 align-top text-bds-gray-60 dark:text-bds-gray-40">To</td>
                  <td className="py-2 text-right">
                    {tx.to ? (
                      <span className="inline-flex items-center gap-1">
                        <TipsExplorerLink chain={chain} type="address" value={tx.to} className="break-all font-mono">
                          {tx.to}
                        </TipsExplorerLink>
                        <CopyButton text={tx.to} />
                      </span>
                    ) : (
                      <span className="font-mono text-bds-gray-60 dark:text-bds-gray-40">
                        Contract Creation
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-bds-gray-10 bg-bds-gray-5/50 px-5 py-3 text-xs sm:grid-cols-4 dark:border-white/10 dark:bg-white/[0.03]">
            <Field label="Nonce" value={String(Number.parseInt(tx.nonce, 16))} />
            <Field label="Max Fee" value={formatGasPrice(tx.maxFeePerGas)} />
            <Field label="Priority Fee" value={formatGasPrice(tx.maxPriorityFeePerGas)} />
            <Field label="Type" value={tx.type === '0x2' ? 'EIP-1559' : tx.type} />
          </div>
        </>
      ) : null}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-bds-gray-60 dark:text-bds-gray-40">{label}</span>{' '}
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function TimelineEventDetails({ event, chain }: { event: BundleEvent; chain: TipsChain }) {
  if (event.event === 'BlockIncluded' && event.data?.block_hash) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">{event.event}</Badge>
        <Link
          href={tipsHref(`/tips/block/${event.data.block_hash}`, chain)}
          className="font-mono text-xs text-base-blue hover:underline"
        >
          Block #{event.data.block_number}
        </Link>
      </div>
    );
  }

  if (event.event === 'BuilderIncluded' && event.data?.builder) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{event.event}</Badge>
        <span className="text-xs text-bds-gray-60 dark:text-bds-gray-40">
          {event.data.builder} (flashblock #{event.data.flashblock_index})
        </span>
      </div>
    );
  }

  if (event.event === 'Dropped' && event.data?.reason) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="error">{event.event}</Badge>
        <span className="text-xs text-bds-gray-60 dark:text-bds-gray-40">{event.data.reason}</span>
      </div>
    );
  }

  return <Badge>{event.event}</Badge>;
}

function Timeline({ events, chain }: { events: BundleEvent[]; chain: TipsChain }) {
  if (events.length === 0) return null;

  return (
    <div className="divide-y divide-bds-gray-10 dark:divide-white/10">
      {events.map((event, index) => (
        <div
          key={`${event.data?.key}-${index}`}
          className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bds-blue-0">
            <div className="h-2 w-2 rounded-full bg-base-blue" />
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <TimelineEventDetails event={event} chain={chain} />
            <time className="text-sm tabular-nums text-bds-gray-60 dark:text-bds-gray-40">
              {event.data?.timestamp ? new Date(event.data.timestamp).toLocaleString() : '—'}
            </time>
          </div>
        </div>
      ))}
    </div>
  );
}

function BundleContent({ params }: PageProps) {
  const { chain } = useTipsChain();
  const [hash, setHash] = useState('');
  const [data, setData] = useState<BundleHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void params.then((p) => setHash(p.hash));
  }, [params]);

  useEffect(() => {
    if (!hash) return;
    let cancelled = false;

    async function load() {
      try {
        const next = await tipsApi.bundle(hash, chain);
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof TipsApiError && err.status === 404
            ? 'Bundle not found'
            : 'Failed to fetch bundle data',
        );
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hash, chain]);

  if (!hash || (loading && !data)) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner className="text-base-blue" />
        <Text variant="label.regular" tone="muted">
          Loading bundle…
        </Text>
      </div>
    );
  }

  const latestBundle = data?.history
    .filter((e) => e.data?.bundle)
    .map((e) => e.data.bundle)
    .pop();

  return (
    <div className="animate-in flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={tipsHref('/tips', chain)}
          className="text-sm text-base-blue hover:underline"
        >
          ← TIPS
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <code className="truncate rounded bg-bds-gray-5 px-2 py-1 font-mono text-xs text-bds-gray-60 dark:bg-white/5 dark:text-bds-gray-40">
            {hash}
          </code>
          <CopyButton text={hash} />
        </div>
      </div>

      {error ? <EmptyState title="Error" description={error} /> : null}

      {data && latestBundle ? (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-4">
            <Text variant="headline">Transactions</Text>
            <div className="flex flex-col gap-3">
              {latestBundle.txs.map((tx, index) => (
                <TransactionDetails key={tx.hash} tx={tx} chain={chain} index={index} />
              ))}
            </div>
          </section>

          {latestBundle.meter_bundle_response ? (
            <section className="flex flex-col gap-4">
              <Text variant="headline">Simulation Results</Text>
              <MeteringCard meter={latestBundle.meter_bundle_response} />
            </section>
          ) : null}

          <section className="flex flex-col gap-4">
            <Text variant="headline">Event History</Text>
            <Card className="bg-background p-6 dark:bg-white/5">
              {data.history.length > 0 ? (
                <Timeline events={data.history} chain={chain} />
              ) : (
                <EmptyState bordered={false} className="py-8 text-center" description="No events recorded yet." />
              )}
            </Card>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function BundlePage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-3 py-16">
          <Spinner className="text-base-blue" />
          <Text variant="label.regular" tone="muted">
            Loading bundle…
          </Text>
        </div>
      }
    >
      <BundleContent params={params} />
    </Suspense>
  );
}
