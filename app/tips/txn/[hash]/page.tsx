'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { EmptyState } from '../../../components/ui/EmptyState';
import { Spinner } from '../../../components/ui/Spinner';
import { Text } from '../../../components/ui/Text';
import { tipsApi, TipsApiError } from '../../library/client';
import { tipsHref } from '../../library/links';
import { useTipsChain } from '../../library/useTipsChain';

interface PageProps {
  params: Promise<{ hash: string }>;
}

// Looks up the transaction's bundle and redirects to the bundle detail page,
// carrying the active chain through the redirect.
function TransactionRedirect({ params }: PageProps) {
  const router = useRouter();
  const { chain } = useTipsChain();
  const [hash, setHash] = useState('');
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
        const result = await tipsApi.txn(hash, chain);
        if (cancelled) return;
        if (result.bundle_ids && result.bundle_ids.length > 0) {
          router.push(tipsHref(`/tips/bundles/${result.bundle_ids[0]}`, chain));
        } else {
          setError('No bundle found for this transaction');
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof TipsApiError && err.status === 404
            ? 'Transaction not found'
            : 'Failed to fetch transaction data',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [hash, chain, router]);

  return (
    <div className="animate-in flex flex-col gap-4">
      <Text variant="title2">Transaction</Text>
      {hash ? (
        <code className="block break-all font-mono text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
          {hash}
        </code>
      ) : null}
      {loading && !error ? (
        <div className="flex items-center gap-3">
          <Spinner className="text-base-blue" />
          <Text variant="label.regular" tone="muted">
            Redirecting to bundle page…
          </Text>
        </div>
      ) : null}
      {error ? <EmptyState description={error} /> : null}
    </div>
  );
}

export default function TransactionRedirectPage({ params }: PageProps) {
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
      <TransactionRedirect params={params} />
    </Suspense>
  );
}
