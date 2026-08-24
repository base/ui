'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Spinner } from '../../../components/ui/Spinner';
import { Text } from '../../../components/ui/Text';
import { CopyButton } from '../../components/CopyButton';
import { EventHistoryRow } from '../../components/EventHistoryRow';
import { ExplorerLink } from '../../components/ExplorerLink';
import type { ExplorerChain } from '../../chains';
import { EXPLORER_LABEL } from '../../flag';
import { explorerApi, ExplorerApiError } from '../../library/client';
import { formatEth, formatGwei, formatInteger, shortHash } from '../../library/explorer-format';
import { explorerHref } from '../../library/links';
import type {
  BundleEvent,
  CoverageState,
  MeterBundleResponse,
  TransactionHistoryResponse,
} from '../../library/types';
import { useExplorerChain } from '../../library/useExplorerChain';

interface PageProps {
  params: Promise<{ hash: string }>;
}

function formatHexInteger(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return '—';
  }
}

function CardHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-bds-gray-10 px-5 py-4 dark:border-white/10">
      <div>
        <Text variant="headline">{title}</Text>
        <Text variant="footnote" tone="muted" className="mt-1">
          {subtitle}
        </Text>
      </div>
      {badge}
    </div>
  );
}

function StatusPill({ state, children }: { state: 'good' | 'bad' | 'warn'; children: React.ReactNode }) {
  const tone =
    state === 'good'
      ? 'bg-bds-green-0 text-bds-green-70 dark:bg-bds-green-90/20 dark:text-bds-green-30'
      : state === 'warn'
        ? 'bg-bds-yellow-0 text-bds-yellow-70 dark:bg-bds-yellow-90/20 dark:text-bds-yellow-20'
        : 'bg-bds-red-0 text-bds-red-70 dark:bg-bds-red-90/20 dark:text-bds-red-20';
  return (
    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', tone)}>{children}</span>
  );
}

function SourceBadge({ label, state }: { label: string; state: CoverageState }) {
  const positive = state === 'available';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        positive
          ? 'bg-bds-green-0 text-bds-green-70 dark:bg-bds-green-90/20 dark:text-bds-green-30'
          : 'bg-bds-gray-5 text-bds-gray-60 dark:bg-white/5 dark:text-bds-gray-40',
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', positive ? 'bg-bds-green-50' : 'bg-bds-gray-40')}
      />
      {label}: {state.replaceAll('_', ' ')}
    </span>
  );
}

function StatCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <Text variant="footnote" tone="muted">
        {label}
      </Text>
      <div className={cn('mt-1 text-black dark:text-white', mono && 'font-mono')}>{value}</div>
    </div>
  );
}

function ChainCard({
  data,
  chain,
}: {
  data: NonNullable<TransactionHistoryResponse['chain']>;
  chain: ExplorerChain;
}) {
  const receipt = data.receipt;
  const included = receipt !== null;
  const succeeded = receipt?.status === 'success';
  const blockHash = receipt?.blockHash ?? data.transaction.blockHash;
  const blockNumberValue = receipt?.blockNumber ?? data.transaction.blockNumber;

  return (
    <Card className="bg-white dark:bg-white/5">
      <CardHeader
        title="On-chain status"
        subtitle="Independently queried from the execution RPC"
        badge={
          <StatusPill state={!included ? 'warn' : succeeded ? 'good' : 'bad'}>
            {!included ? 'Pending receipt' : succeeded ? 'Succeeded' : 'Reverted'}
          </StatusPill>
        }
      />
      <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <Text variant="footnote" tone="muted">
            Block
          </Text>
          {blockHash ? (
            <Link
              href={explorerHref(`/block/${blockHash}`, chain)}
              className="mt-1 block font-mono text-base-blue hover:underline dark:text-bds-blue-20"
            >
              #{formatHexInteger(blockNumberValue)}
            </Link>
          ) : (
            <div className="mt-1 text-black dark:text-white">Pending</div>
          )}
        </div>
        <StatCell
          label="Transaction index"
          value={formatHexInteger(receipt?.transactionIndex ?? data.transaction.transactionIndex)}
        />
        <StatCell label="Gas used" value={formatHexInteger(receipt?.gasUsed)} mono />
      </div>
      <div className="border-t border-bds-gray-10 px-5 py-3 dark:border-white/10">
        <ExplorerLink
          chain={chain}
          type="tx"
          value={data.transaction.hash}
          className="text-xs font-medium text-base-blue hover:underline dark:text-bds-blue-20"
        >
          View on block explorer ↗
        </ExplorerLink>
      </div>
    </Card>
  );
}

function simulationMeter(history: BundleEvent[]): MeterBundleResponse | null {
  const simulationEvent = [...history]
    .reverse()
    .find(
      (event) =>
        event.event === 'SIMULATION_SUCCEEDED' && event.data.bundle?.meter_bundle_response,
    );
  if (simulationEvent?.data.bundle?.meter_bundle_response) {
    return simulationEvent.data.bundle.meter_bundle_response;
  }

  const fallbackEvent = [...history]
    .reverse()
    .find((event) => event.data.bundle?.meter_bundle_response);
  return fallbackEvent?.data.bundle?.meter_bundle_response ?? null;
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-bds-gray-60 dark:text-bds-gray-40">{label}</span>{' '}
      <span className="font-medium text-black dark:text-white">{value}</span>
    </div>
  );
}

function SimulationCard({ meter }: { meter: MeterBundleResponse | null }) {
  if (!meter) {
    return (
      <Card className="bg-white dark:bg-white/5">
        <CardHeader
          title="Simulation results"
          subtitle="Audit or archive metering data for this transaction"
          badge={
            <span className="rounded-full bg-bds-gray-5 px-2.5 py-1 text-xs font-medium text-bds-gray-60 dark:bg-white/5 dark:text-bds-gray-40">
              Unavailable
            </span>
          }
        />
        <div className="px-5 py-6 text-sm text-bds-gray-60 dark:text-bds-gray-40">
          No simulation result is available from the configured sources.
        </div>
      </Card>
    );
  }

  const executionTimeUs = meter.results.reduce((sum, result) => sum + result.executionTimeUs, 0);
  const stateRootTimeUs = meter.stateRootTimeUs ?? 0;
  const totalTimeUs = executionTimeUs + stateRootTimeUs;
  const accountTrieNodes =
    (meter.stateRootAccountLeafCount ?? 0) + (meter.stateRootAccountBranchCount ?? 0);
  const storageTrieNodes =
    (meter.stateRootStorageLeafCount ?? 0) + (meter.stateRootStorageBranchCount ?? 0);

  return (
    <Card className="bg-white dark:bg-white/5">
      <CardHeader
        title="Simulation results"
        subtitle="Metering data from Audit or the legacy archive"
        badge={
          <span className="rounded-full bg-bds-green-0 px-2.5 py-1 text-xs font-medium text-bds-green-70 dark:bg-bds-green-90/20 dark:text-bds-green-30">
            Available
          </span>
        }
      />
      <div className="grid gap-6 px-5 py-5 sm:grid-cols-3">
        <StatCell label="Execution" value={`${formatInteger(executionTimeUs)}μs`} />
        <StatCell label="State root" value={`${formatInteger(stateRootTimeUs)}μs`} />
        <StatCell label="Total time" value={`${formatInteger(totalTimeUs)}μs`} />
      </div>
      {accountTrieNodes > 0 || storageTrieNodes > 0 ? (
        <div className="grid grid-cols-2 gap-6 border-t border-bds-gray-10 px-5 py-4 dark:border-white/10">
          <StatCell label="Account trie nodes" value={formatInteger(accountTrieNodes)} />
          <StatCell label="Storage trie nodes" value={formatInteger(storageTrieNodes)} />
        </div>
      ) : null}
      <div className="grid gap-3 border-t border-bds-gray-10 bg-bds-gray-5/50 px-5 py-4 text-xs sm:grid-cols-2 lg:grid-cols-5 dark:border-white/10 dark:bg-white/[0.03]">
        <FooterStat label="Total gas" value={formatInteger(meter.totalGasUsed)} />
        <FooterStat label="Gas price" value={formatGwei(meter.bundleGasPrice)} />
        <FooterStat label="Gas fees" value={formatEth(meter.gasFees)} />
        <FooterStat label="Coinbase diff" value={formatEth(meter.coinbaseDiff)} />
        <FooterStat label="State block" value={`#${formatInteger(meter.stateBlockNumber)}`} />
      </div>
    </Card>
  );
}

function ProvenanceFooter({
  data,
  chain,
}: {
  data: TransactionHistoryResponse;
  chain: ExplorerChain;
}) {
  return (
    <footer className="border-t border-bds-gray-10 pt-6 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Text variant="label.medium">Data provenance</Text>
          <Text variant="footnote" tone="muted" className="mt-1">
            These sources answer different questions and may be available independently.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <SourceBadge label="Audit" state={data.coverage.audit} />
          <SourceBadge label="Chain" state={data.coverage.chain} />
          <SourceBadge label="Archive" state={data.coverage.archive} />
          <SourceBadge label="Block journal" state={data.coverage.block_events} />
        </div>
      </div>
      {data.bundle_ids.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-bds-gray-10 pt-4 text-xs dark:border-white/10">
          <span className="font-medium text-black dark:text-white">Bundle keys</span>
          {data.bundle_ids.map((bundleId) => (
            <Link
              key={bundleId}
              href={explorerHref(`/bundles/${bundleId}`, chain)}
              className="rounded bg-bds-gray-5 px-2 py-1 font-mono text-base-blue hover:underline dark:bg-white/5 dark:text-bds-blue-20"
            >
              {shortHash(bundleId)}
            </Link>
          ))}
        </div>
      ) : null}
      {data.chain?.receipt && data.coverage.block_events !== 'available' ? (
        <p className="mt-4 rounded-lg bg-bds-yellow-0 px-3 py-2 text-xs text-bds-yellow-80 dark:bg-bds-yellow-90/20 dark:text-bds-yellow-20">
          On-chain inclusion is confirmed independently, but the audit journal has no matching
          block-correlation event.
        </p>
      ) : null}
    </footer>
  );
}

function TransactionContent({ params }: PageProps) {
  const { chain } = useExplorerChain();
  const [hash, setHash] = useState('');
  const [data, setData] = useState<TransactionHistoryResponse | null>(null);
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
        const next = await explorerApi.txn(hash, chain);
        if (cancelled) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ExplorerApiError && err.status === 404
            ? 'Transaction not found'
            : 'Failed to fetch transaction data',
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
          Loading transaction…
        </Text>
      </div>
    );
  }

  return (
    <div className="animate-in flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={explorerHref('', chain)}
            className="text-sm text-base-blue hover:underline dark:text-bds-blue-20"
          >
            ← {EXPLORER_LABEL}
          </Link>
        </div>
        <div>
          <Text variant="label.medium" className="text-base-blue dark:text-bds-blue-20">
            Transaction
          </Text>
          <div className="mt-1 flex items-center gap-2">
            <code className="break-all font-mono text-lg font-semibold text-black dark:text-white">
              {hash}
            </code>
            <CopyButton text={hash} />
          </div>
        </div>
      </section>

      {error ? <EmptyState title="Unable to load transaction" description={error} /> : null}

      {data ? (
        <>
          {data.chain ? <ChainCard data={data.chain} chain={chain} /> : null}
          <SimulationCard meter={simulationMeter(data.history)} />

          <section className="flex flex-col gap-4">
            <Text variant="headline">Audit and archive timeline</Text>
            <Card className="bg-white p-6 dark:bg-white/5">
              {data.history.length > 0 ? (
                data.history.map((event, index) => (
                  <EventHistoryRow
                    key={`${event.event}-${event.data.key ?? index}`}
                    event={event}
                    isLast={index === data.history.length - 1}
                    startTimestamp={data.history[0]?.data.timestamp ?? event.data.timestamp}
                    chain={chain}
                    highlightIncluded
                  />
                ))
              ) : (
                <div className="py-8 text-center text-sm text-bds-gray-60 dark:text-bds-gray-40">
                  No journal or archive events are available for this transaction.
                </div>
              )}
            </Card>
          </section>

          <ProvenanceFooter data={data} chain={chain} />
        </>
      ) : null}
    </div>
  );
}

export default function TransactionPage({ params }: PageProps) {
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
      <TransactionContent params={params} />
    </Suspense>
  );
}
