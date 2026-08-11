'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Text } from '../../components/ui/Text';
import { BlockTable } from '../components/ExplorerTables';
import { ExplorerNav } from '../components/ExplorerNav';
import { tipsApi } from '../library/client';
import { formatInteger } from '../library/explorer-format';
import { tipsHref } from '../library/links';
import type { BlocksResponse } from '../library/types';
import { useTipsChain } from '../library/useTipsChain';

const PAGE_LIMIT = 25;

function BlocksContent() {
  const { chain } = useTipsChain();
  const searchParams = useSearchParams();
  const cursorParam = searchParams.get('cursor');
  const cursor = cursorParam !== null ? Number(cursorParam) : undefined;

  const [data, setData] = useState<BlocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    tipsApi
      .blocksPage(chain, { cursor, limit: PAGE_LIMIT }, controller.signal)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (controller.signal.aborted || cancelled) return;
        setError('Failed to fetch blocks');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [chain, cursor]);

  return (
    <div className="animate-in flex flex-col gap-6">
      <ExplorerNav chain={chain} active="blocks" />

      <div className="flex items-end justify-between gap-4">
        <div>
          <Text variant="title2">Blocks</Text>
          <Text variant="label.regular" tone="muted" className="mt-1">
            Browse recent Base blocks and their execution limits.
          </Text>
        </div>
        {cursor !== undefined ? (
          <Link
            href={tipsHref('/tips/blocks', chain)}
            className="shrink-0 text-sm text-base-blue hover:underline dark:text-bds-blue-20"
          >
            Latest blocks
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

      <Card className="overflow-hidden bg-white dark:bg-white/5">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12">
            <Spinner className="text-base-blue" />
            <Text variant="label.regular" tone="muted">
              Loading blocks…
            </Text>
          </div>
        ) : data && data.blocks.length > 0 ? (
          <BlockTable blocks={data.blocks} chain={chain} />
        ) : (
          <div className="py-12 text-center text-bds-gray-60 dark:text-bds-gray-40">
            No blocks available
          </div>
        )}

        {data ? (
          <div className="flex items-center justify-between border-t border-bds-gray-10 px-4 py-3 text-sm dark:border-white/10">
            <span className="text-bds-gray-60 dark:text-bds-gray-40">
              {data.blocks.length > 0
                ? `Blocks ${formatInteger(data.blocks[0]?.number)}–${formatInteger(data.blocks.at(-1)?.number)}`
                : 'No blocks'}
            </span>
            {data.page.nextCursor !== null ? (
              <Link
                href={tipsHref(`/tips/blocks?cursor=${data.page.nextCursor}`, chain)}
                className="font-medium text-base-blue hover:underline dark:text-bds-blue-20"
              >
                Older blocks →
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default function BlocksPage() {
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
      <BlocksContent />
    </Suspense>
  );
}
