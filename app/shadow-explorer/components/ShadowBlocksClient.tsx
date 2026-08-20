'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Text } from '../../components/ui/Text';
import { shadowExplorerApi } from '../library/client';
import { formatInteger } from '../library/format';
import { shadowHref } from '../library/links';
import type { ShadowBlocksResponse, ShadowNetwork } from '../library/types';
import { GAS_DIFF_THRESHOLD_PCT, ShadowBlockTable, isGasDiffOutOfBand } from './ShadowBlockTable';

const PAGE_LIMIT = 25;

export function ShadowBlocksClient({ network, chain }: { network: ShadowNetwork; chain: string }) {
  const searchParams = useSearchParams();
  const offsetParam = searchParams.get('offset');
  const offset = offsetParam !== null ? Number(offsetParam) : undefined;

  const [data, setData] = useState<ShadowBlocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    shadowExplorerApi
      .shadowBlocks(network, chain, { offset, limit: PAGE_LIMIT }, controller.signal)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (controller.signal.aborted || cancelled) return;
        setError('Failed to fetch shadow blocks');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [network, chain, offset]);

  const outOfBandCount = data?.blocks.filter(isGasDiffOutOfBand).length ?? 0;

  return (
    <div className="animate-in flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Text variant="title2">Shadow Blocks</Text>
          <Text variant="label.regular" tone="muted" className="mt-1">
            Reorged-out shadow candidates vs. the canonical block that replaced them. Gas Δ is
            shadow − canonical; rows over ±{GAS_DIFF_THRESHOLD_PCT}% are flagged.
          </Text>
        </div>
        {offset !== undefined && offset > 0 ? (
          <Link
            href={shadowHref(network, chain, '/shadow-blocks')}
            className="shrink-0 text-sm text-base-blue hover:underline dark:text-bds-blue-20"
          >
            Latest
          </Link>
        ) : null}
      </div>

      {error ? (
        <Card className="border-bds-red-30 bg-bds-red-0 p-4 dark:border-bds-red-60 dark:bg-bds-red-90/20">
          <Text variant="label.regular" className="text-bds-red-70 dark:text-bds-red-20">
            {error}
          </Text>
        </Card>
      ) : null}

      {!error && data && outOfBandCount > 0 ? (
        <Card className="border-bds-red-30 bg-bds-red-0 p-4 dark:border-bds-red-60 dark:bg-bds-red-90/20">
          <Text variant="label.regular" className="text-bds-red-70 dark:text-bds-red-20">
            {outOfBandCount} of {data.blocks.length} shadow blocks on this page differ from canonical
            by more than ±{GAS_DIFF_THRESHOLD_PCT}% gas.
          </Text>
        </Card>
      ) : null}

      <Card className="overflow-hidden bg-white dark:bg-white/5">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12">
            <Spinner className="text-base-blue" />
            <Text variant="label.regular" tone="muted">
              Loading shadow blocks…
            </Text>
          </div>
        ) : data && data.blocks.length > 0 ? (
          <ShadowBlockTable blocks={data.blocks} />
        ) : (
          <div className="py-12 text-center text-bds-gray-60 dark:text-bds-gray-40">
            No shadow blocks available
          </div>
        )}

        {data ? (
          <div className="flex items-center justify-between border-t border-bds-gray-10 px-4 py-3 text-sm dark:border-white/10">
            <span className="text-bds-gray-60 dark:text-bds-gray-40">
              {data.page.totalCount > 0
                ? `${formatInteger(data.page.totalCount)} reorged shadow blocks`
                : 'No shadow blocks'}
            </span>
            {data.page.nextOffset !== null ? (
              <Link
                href={shadowHref(network, chain, `/shadow-blocks?offset=${data.page.nextOffset}`)}
                className="font-medium text-base-blue hover:underline dark:text-bds-blue-20"
              >
                Older →
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
