'use client';

// Single timeline event for the audit/archive history on the block, bundle, and
// transaction pages. Chain-aware: block links carry ?chain=.
import Link from 'next/link';
import { useState } from 'react';

import { cn } from '../../components/ui/cn';
import type { ExplorerChain } from '../chains';
import { explorerHref } from '../library/links';
import type { BundleEvent } from '../library/types';

function EventChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-bds-gray-10 bg-bds-gray-5 px-2 py-0.5 text-xs font-medium text-bds-gray-60 dark:border-white/10 dark:bg-white/5 dark:text-bds-gray-40">
      {children}
    </span>
  );
}

function EventMarker({ success, isLast }: { success: boolean; isLast: boolean }) {
  return (
    <div className="relative flex w-7 shrink-0 justify-center">
      {!isLast && <div className="absolute bottom-0 top-7 w-px bg-bds-gray-10 dark:bg-white/10" />}
      <div
        className={cn(
          'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border bg-white dark:bg-bds-gray-90',
          success
            ? 'border-bds-green-30 dark:border-bds-green-60'
            : 'border-bds-gray-10 dark:border-white/10',
        )}
      >
        <div
          className={cn(
            'h-2 w-2 rounded-full',
            success ? 'bg-bds-green-50' : 'bg-bds-gray-40',
          )}
        />
      </div>
    </div>
  );
}

function metadataChips(event: BundleEvent): string[] {
  return [
    event.data.producer ? `source: ${event.data.producer}` : null,
    event.data.target ? `target: ${event.data.target}` : null,
    event.data.reason ? `reason: ${event.data.reason}` : null,
  ].filter((value): value is string => value !== null);
}

function formatLatency(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function BlockFlashblockContext({ event, chain }: { event: BundleEvent; chain: ExplorerChain }) {
  const blockNumber = event.data.block_number;
  const flashblockIndex = event.data.flashblock_index;

  if (blockNumber === undefined && flashblockIndex === undefined) {
    return null;
  }

  const label = [
    blockNumber !== undefined ? `Block #${blockNumber}` : null,
    flashblockIndex !== undefined ? `FB${flashblockIndex}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(' · ');

  const className = 'mt-1 inline-flex text-xs font-medium tabular-nums text-bds-gray-50 dark:text-bds-gray-40';

  if (event.data.block_hash) {
    return (
      <Link
        href={explorerHref(`/block/${event.data.block_hash}`, chain)}
        className={cn(className, 'hover:text-base-blue hover:underline dark:hover:text-bds-blue-20')}
      >
        {label}
      </Link>
    );
  }

  return <span className={className}>{label}</span>;
}

function JsonToggle({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-bds-gray-10 bg-white px-2 py-1 text-xs font-medium text-bds-gray-60 transition-colors hover:border-bds-gray-20 hover:bg-bds-gray-5 hover:text-black dark:border-white/10 dark:bg-white/5 dark:text-bds-gray-40 dark:hover:bg-white/10 dark:hover:text-white"
      aria-expanded={expanded}
    >
      <svg
        className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <title>Toggle JSON</title>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
      JSON
    </button>
  );
}

export function EventHistoryRow({
  event,
  isLast,
  startTimestamp,
  chain,
  highlightIncluded = false,
}: {
  event: BundleEvent;
  isLast: boolean;
  startTimestamp: number;
  chain: ExplorerChain;
  highlightIncluded?: boolean;
}) {
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const success =
    highlightIncluded &&
    (event.event === 'BUILDER_INCLUDED' || event.event === 'BUILDER_FLASHBLOCK_PUBLISHED');
  const chips = metadataChips(event);
  const elapsedMs = event.data.timestamp - startTimestamp;

  return (
    <div className="flex gap-3">
      <EventMarker success={success} isLast={isLast} />
      <div className="min-w-0 flex-1 pb-5">
        <div className="rounded-lg border border-bds-gray-10 bg-white px-4 py-3 transition-colors hover:border-bds-gray-20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20">
          <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1.1fr)_minmax(12rem,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <div
                className={cn(
                  'break-words text-sm font-semibold',
                  success ? 'text-bds-green-70 dark:text-bds-green-30' : 'text-black dark:text-white',
                )}
              >
                {event.event}
              </div>
              <BlockFlashblockContext event={event} chain={chain} />
            </div>
            <div className="flex min-w-0 flex-wrap items-start gap-2">
              {chips.map((chip) => (
                <EventChip key={chip}>{chip}</EventChip>
              ))}
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              <time className="text-xs font-medium tabular-nums text-bds-gray-50 dark:text-bds-gray-40 sm:text-sm">
                {elapsedMs > 0
                  ? `T + ${formatLatency(elapsedMs)}`
                  : event.data.timestamp
                    ? new Date(event.data.timestamp).toLocaleString()
                    : '-'}
              </time>
              {event.data.originalEvent !== undefined && (
                <JsonToggle
                  expanded={jsonExpanded}
                  onClick={() => setJsonExpanded((value) => !value)}
                />
              )}
            </div>
          </div>
          {event.data.originalEvent !== undefined && jsonExpanded && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-bds-gray-90 p-3 text-xs text-bds-gray-5 dark:bg-black">
              {JSON.stringify(event.data.originalEvent, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
