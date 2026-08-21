'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Spinner } from '../../../components/ui/Spinner';
import { Text } from '../../../components/ui/Text';
import { tipsApi, TipsApiError } from '../../library/client';
import { formatAge, formatInteger } from '../../library/explorer-format';
import { shortHash } from '../../library/format';
import { tipsHref } from '../../library/links';
import type { ShadowBlockDetail, ShadowBlockSummary } from '../../library/types';
import { useTipsChain } from '../../library/useTipsChain';

interface PageProps {
  params: Promise<{ hash: string }>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-bds-gray-50 dark:text-bds-gray-40">
        {label}
      </span>
      <span className="break-all text-sm text-black dark:text-white">{children}</span>
    </div>
  );
}

function ShadowBlockContent({ params }: PageProps) {
  const { chain } = useTipsChain();
  const [hash, setHash] = useState('');
  const [summary, setSummary] = useState<ShadowBlockSummary | null>(null);
  const [detail, setDetail] = useState<ShadowBlockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void params.then((p) => setHash(p.hash));
  }, [params]);

  useEffect(() => {
    if (!hash) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSummary(null);
    setDetail(null);

    async function load() {
      try {
        const response = await tipsApi.shadowBlock(hash, chain);
        if (!cancelled) {
          setSummary(response.summary);
          setDetail(response.detail);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof TipsApiError && err.status === 404
            ? 'Shadow block not found'
            : 'Failed to fetch shadow block data',
        );
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
          Loading shadow block…
        </Text>
      </div>
    );
  }

  return (
    <div className="animate-in flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href={tipsHref('/tips', chain)} className="text-sm text-base-blue hover:underline">
          ← TIPS
        </Link>
      </div>

      {error ? <EmptyState title="Error" description={error} /> : null}

      {summary && detail ? (
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Text variant="title2">Shadow Block #{formatInteger(summary.number)}</Text>
              <span className="inline-flex rounded-full bg-bds-red-0 px-2 py-0.5 text-xs font-medium text-bds-red-70 dark:bg-bds-red-90/20 dark:text-bds-red-20">
                Reorged-out shadow
              </span>
            </div>
            <Text variant="label.regular" tone="muted" className="mt-1 break-all font-mono">
              {summary.hash}
            </Text>
          </div>

          <Card className="grid grid-cols-1 gap-4 bg-white p-5 sm:grid-cols-2 dark:bg-white/5">
            <Field label="Age">{formatAge(detail.timestamp)}</Field>
            <Field label="Transactions">{formatInteger(detail.txCount)}</Field>
            <Field label="Gas used">{formatInteger(detail.gasUsed)}</Field>
            <Field label="Gas limit">{formatInteger(detail.gasLimit)}</Field>
            <Field label="Parent hash">
              <span className="font-mono" title={detail.parentHash}>
                {shortHash(detail.parentHash)}
              </span>
            </Field>
            {detail.canonicalHash ? (
              <Field label="Canonical replacement">
                <Link
                  href={tipsHref(`/tips/block/${detail.canonicalHash}`, chain)}
                  className="font-mono text-base-blue hover:underline"
                  title={`View canonical block in TIPS: ${detail.canonicalHash}`}
                >
                  {shortHash(detail.canonicalHash)} <span aria-hidden>↗</span>
                </Link>
              </Field>
            ) : null}
          </Card>

          <div className="flex flex-col gap-3">
            <Text variant="headline">Transactions</Text>
            <Card className="overflow-hidden bg-white dark:bg-white/5">
              {detail.transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-bds-gray-10 bg-bds-gray-5/60 dark:border-white/10 dark:bg-white/[0.03]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          Hash
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          From
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          To
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          Gas used
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bds-gray-10 dark:divide-white/10">
                      {detail.transactions.map((tx) => (
                        <tr key={tx.index} className="text-black dark:text-white">
                          <td className="px-4 py-3">{tx.index}</td>
                          <td className="px-4 py-3 font-mono text-xs" title={tx.hash}>
                            {shortHash(tx.hash)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs" title={tx.from ?? undefined}>
                            {tx.from ? shortHash(tx.from, 6, 4) : '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs" title={tx.to ?? undefined}>
                            {tx.to ? shortHash(tx.to, 6, 4) : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {tx.gasUsed !== undefined ? formatInteger(tx.gasUsed) : '—'}
                          </td>
                          <td className="px-4 py-3">{tx.txType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-bds-gray-60 dark:text-bds-gray-40">
                  No transactions in this block
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ShadowBlockPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-3 py-16">
          <Spinner className="text-base-blue" />
          <Text variant="label.regular" tone="muted">
            Loading shadow block…
          </Text>
        </div>
      }
    >
      <ShadowBlockContent params={params} />
    </Suspense>
  );
}
