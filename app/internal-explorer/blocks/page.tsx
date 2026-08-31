'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Text } from '../../components/ui/Text';
import { BlockTable } from '../components/ExplorerTables';
import { ExplorerNav } from '../components/ExplorerNav';
import { ActiveBlockButton } from '../components/ActiveBlockButton';
import { explorerApi } from '../library/client';
import { formatInteger } from '../library/explorer-format';
import { explorerHref } from '../library/links';
import type { BlocksResponse, ShadowBlockSummary } from '../library/types';
import { useExplorerChain } from '../library/useExplorerChain';
import { useShadowDelta } from '../library/useShadowDelta';

const PAGE_LIMIT = 25;

function BlocksContent() {
  const { chain } = useExplorerChain();
  const { showShadowDelta, setShowShadowDelta } = useShadowDelta();
  const searchParams = useSearchParams();
  const cursorParam = searchParams.get('cursor');
  const cursor = cursorParam !== null ? Number(cursorParam) : undefined;

  const [data, setData] = useState<BlocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shadowCandidates, setShadowCandidates] = useState<Record<string, ShadowBlockSummary[]>>({});

  // Canonical-block view: paginate the chain tip directly. The shadow-delta
  // view has its own source below, so this fetch stands down when it is on.
  useEffect(() => {
    if (showShadowDelta) return undefined;

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setShadowCandidates({});

    explorerApi
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
  }, [chain, cursor, showShadowDelta]);

  // The canonical tip rarely holds a block with a shadow replacement, so this
  // view is driven by recent shadow blocks (dense, newest first) with each
  // canonical block resolved by number to fill the base columns.
  useEffect(() => {
    if (!showShadowDelta) return undefined;

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setShadowCandidates({});

    explorerApi
      .recentShadowBlocks(chain, { limit: PAGE_LIMIT }, controller.signal)
      .then(async (shadows) => {
        if (cancelled) return;
        if (shadows.length === 0) {
          setData({
            blocks: [],
            page: { cursor: null, limit: PAGE_LIMIT, latestBlockNumber: 0, nextCursor: null, hasMore: false },
          });
          return;
        }

        const numbers = shadows.map((shadow) => shadow.number);
        const canonicalBlocks = await explorerApi.blocksByNumbers(chain, numbers, controller.signal);
        if (cancelled) return;

        const canonicalByNumber = new Map(canonicalBlocks.map((block) => [block.number, block]));
        const orderedBlocks = shadows
          .map((shadow) => canonicalByNumber.get(shadow.number))
          .filter((block): block is NonNullable<typeof block> => block !== undefined);
        const candidates = Object.fromEntries(
          shadows
            .filter((shadow) => shadow.canonicalHash !== undefined)
            .map((shadow) => [shadow.canonicalHash!.toLowerCase(), [shadow]]),
        );

        setShadowCandidates(candidates);
        setData({
          blocks: orderedBlocks,
          page: {
            cursor: null,
            limit: PAGE_LIMIT,
            latestBlockNumber: orderedBlocks[0]?.number ?? 0,
            nextCursor: null,
            hasMore: false,
          },
        });
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
  }, [chain, showShadowDelta]);

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
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
          <ActiveBlockButton chain={chain} onError={setError} />
          {cursor !== undefined ? (
            <Link
              href={explorerHref('/blocks', chain)}
              className="text-sm text-base-blue hover:underline dark:text-bds-blue-20"
            >
              Latest blocks
            </Link>
          ) : null}
        </div>
      </div>

      <label className="inline-flex cursor-pointer select-none items-center gap-2 self-end text-sm text-bds-gray-60 dark:text-bds-gray-40">
        <input
          type="checkbox"
          checked={showShadowDelta}
          onChange={(event) => setShowShadowDelta(event.target.checked)}
          className="h-4 w-4 accent-base-blue"
        />
        Show shadow Δ
      </label>

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
          <BlockTable
            blocks={data.blocks}
            chain={chain}
            showShadowDelta={showShadowDelta}
            shadowBlocks={shadowCandidates}
          />
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
                href={explorerHref(`/blocks?cursor=${data.page.nextCursor}`, chain)}
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
