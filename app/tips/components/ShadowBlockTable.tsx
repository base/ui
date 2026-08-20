// Purpose-built table for the shadow block explorer. Each row is a reorged-out
// shadow block paired with the canonical block that replaced it, surfacing the
// gas/tx deltas used to validate a builder canary. Chain-aware: the canonical
// link carries ?chain= via tipsHref. Client-safe: pure formatters only.
import Link from 'next/link';

import { cn } from '../../components/ui/cn';
import type { TipsChain } from '../chains';
import { formatAge, formatInteger, shortHash } from '../library/explorer-format';
import { tipsHref } from '../library/links';
import type { ShadowBlockSummary } from '../library/types';

// Canary threshold: rows whose gas differs from canonical by more than this are
// flagged. The working requirement is "gas used within ~50%".
export const GAS_DIFF_THRESHOLD_PCT = 50;

function formatSignedInteger(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString()}`;
}

function formatSignedPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function isGasDiffOutOfBand(block: ShadowBlockSummary): boolean {
  return block.gasDiffPct !== undefined && Math.abs(block.gasDiffPct) > GAS_DIFF_THRESHOLD_PCT;
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

const linkClass = 'text-base-blue hover:underline dark:text-bds-blue-20';

function GasDiffCell({ block }: { block: ShadowBlockSummary }) {
  if (block.gasDiffAbs === undefined || block.gasDiffPct === undefined) {
    return <span className="text-bds-gray-50 dark:text-bds-gray-40">—</span>;
  }

  const outOfBand = isGasDiffOutOfBand(block);
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'whitespace-nowrap font-medium',
          outOfBand ? 'text-bds-red-70 dark:text-bds-red-20' : 'text-black dark:text-white',
        )}
      >
        {formatSignedPct(block.gasDiffPct)}
      </span>
      <span className="whitespace-nowrap text-xs text-bds-gray-50 dark:text-bds-gray-40">
        {formatSignedInteger(block.gasDiffAbs)}
      </span>
      {outOfBand ? (
        <span className="mt-0.5 inline-flex w-fit rounded bg-bds-red-0 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-bds-red-70 dark:bg-bds-red-90/20 dark:text-bds-red-20">
          &gt;{GAS_DIFF_THRESHOLD_PCT}%
        </span>
      ) : null}
    </div>
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
  chain,
}: {
  blocks: ShadowBlockSummary[];
  chain: TipsChain;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-bds-gray-10 bg-bds-gray-5/60 dark:border-white/10 dark:bg-white/[0.03]">
          <tr>
            <TableHeader>Height</TableHeader>
            <TableHeader>Age</TableHeader>
            <TableHeader>Builder</TableHeader>
            <TableHeader>Gas (shadow / canon)</TableHeader>
            <TableHeader>Gas Δ</TableHeader>
            <TableHeader>Txns (shadow / canon)</TableHeader>
            <TableHeader>Canonical</TableHeader>
          </tr>
        </thead>
        <tbody className="divide-y divide-bds-gray-10 dark:divide-white/10">
          {blocks.map((block) => (
            <tr key={block.hash} className="hover:bg-bds-gray-5/60 dark:hover:bg-white/5">
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
              <Cell className="whitespace-nowrap">
                {formatInteger(block.shadowGasUsed)}
                <span className="text-bds-gray-40"> / </span>
                {formatInteger(block.canonicalGasUsed)}
              </Cell>
              <Cell>
                <GasDiffCell block={block} />
              </Cell>
              <Cell className="whitespace-nowrap">
                {formatInteger(block.shadowTxCount)}
                <span className="text-bds-gray-40"> / </span>
                {formatInteger(block.canonicalTxCount)}
                {block.txCountDiff !== undefined && block.txCountDiff !== 0 ? (
                  <span className="ml-1 text-xs text-bds-gray-50 dark:text-bds-gray-40">
                    ({formatSignedInteger(block.txCountDiff)})
                  </span>
                ) : null}
              </Cell>
              <Cell>
                <Link
                  href={tipsHref(`/tips/block/${block.canonicalHash}`, chain)}
                  className={cn('font-mono', linkClass)}
                  title={block.canonicalHash}
                >
                  {shortHash(block.canonicalHash)}
                </Link>
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
