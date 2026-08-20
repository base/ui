'use client';

// Table for the shadow block explorer. Each row is a reorged-out shadow block
// paired with the canonical block that replaced it, surfacing the gas/tx deltas
// used to validate a builder canary. Rows are clickable: the row drills into the
// shadow block, the Canonical cell drills into the canonical block.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type React from 'react';

import { cn } from '../../components/ui/cn';
import { formatAge, formatInteger, shortHash } from '../library/format';
import { shadowHref, tipsCanonicalBlockHref } from '../library/links';
import type { ShadowNetwork } from '../networks';
import type { ShadowBlockSummary } from '../library/types';

// A reconciled block is unhealthy when it failed at least one health check.
export function isUnhealthy(block: ShadowBlockSummary): boolean {
  return block.health.reconciled && block.health.passed < block.health.total;
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bds-gray-60 dark:text-bds-gray-40">
      {children}
    </th>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-black dark:text-white', className)}>{children}</td>;
}

function HealthCell({ block }: { block: ShadowBlockSummary }) {
  const { reconciled, passed, total } = block.health;
  if (!reconciled) {
    return <span className="text-bds-gray-50 dark:text-bds-gray-40">pending</span>;
  }

  const ok = passed === total;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-sm font-medium tabular-nums',
        ok
          ? 'bg-bds-green-0 text-bds-green-70 dark:bg-bds-green-90/20 dark:text-bds-green-20'
          : 'bg-bds-red-0 text-bds-red-70 dark:bg-bds-red-90/20 dark:text-bds-red-20',
      )}
    >
      {passed}/{total}
    </span>
  );
}

function BuilderCell({ block }: { block: ShadowBlockSummary }) {
  const changed =
    block.canonicalBuilderVersion !== undefined &&
    block.canonicalBuilderVersion !== block.shadowBuilderVersion;
  return (
    <div className="flex flex-col gap-0.5 font-mono text-xs">
      <span className="text-black dark:text-white">{block.shadowBuilderVersion}</span>
      {changed ? (
        <span className="text-bds-gray-50 dark:text-bds-gray-40">
          canon: {block.canonicalBuilderVersion}
        </span>
      ) : null}
    </div>
  );
}

export function ShadowBlockTable({
  blocks,
  network,
  chain,
}: {
  blocks: ShadowBlockSummary[];
  network: ShadowNetwork;
  chain: string;
}) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-bds-gray-10 bg-bds-gray-5/60 dark:border-white/10 dark:bg-white/[0.03]">
          <tr>
            <TableHeader>Height</TableHeader>
            <TableHeader>Age</TableHeader>
            <TableHeader>Builder</TableHeader>
            <TableHeader>Health</TableHeader>
            <TableHeader>Canonical</TableHeader>
          </tr>
        </thead>
        <tbody className="divide-y divide-bds-gray-10 dark:divide-white/10">
          {blocks.map((block) => {
            const open = () => router.push(shadowHref(network, chain, `/block/${block.hash}`));
            return (
            <tr
              key={block.hash}
              role="link"
              tabIndex={0}
              aria-label={`Shadow block ${block.number}`}
              onClick={open}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  open();
                }
              }}
              className="cursor-pointer hover:bg-bds-gray-5/60 focus:bg-bds-gray-5/60 focus:outline-none dark:hover:bg-white/5 dark:focus:bg-white/5"
            >
              <Cell>
                <span className="font-medium">#{formatInteger(block.number)}</span>
                <div
                  className="mt-0.5 font-mono text-xs text-bds-gray-50 dark:text-bds-gray-40"
                  title={block.hash}
                >
                  {shortHash(block.hash)}
                </div>
              </Cell>
              <Cell className="whitespace-nowrap text-bds-gray-60 dark:text-bds-gray-40">
                {formatAge(block.timestamp)}
              </Cell>
              <Cell>
                <BuilderCell block={block} />
              </Cell>
                <Cell>
                  <HealthCell block={block} />
                </Cell>
                <Cell>
                <Link
                  href={tipsCanonicalBlockHref(network, block.canonicalHash)}
                  onClick={(event) => event.stopPropagation()}
                  className="font-mono text-base-blue hover:underline dark:text-bds-blue-20"
                  title={`View canonical block in TIPS: ${block.canonicalHash}`}
                >
                  {shortHash(block.canonicalHash)}
                </Link>
              </Cell>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
