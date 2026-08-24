// Basescan-style shared tables for the blocks/txs explorer surfaces. Chain-aware:
// internal links carry ?chain= via tipsHref.
import Link from 'next/link';

import { cn } from '../../components/ui/cn';
import type { TipsChain } from '../chains';
import {
  formatAction,
  formatAge,
  formatEth,
  formatGwei,
  formatInteger,
  type NumericValue,
  shortAddress,
  shortHash,
} from '../library/explorer-format';
import { tipsHref } from '../library/links';
import type { BlockSummary } from '../library/types';

export interface TransactionTableItem {
  hash: string;
  blockNumber: NumericValue;
  transactionIndex?: NumericValue;
  blockTimestamp: NumericValue;
  from: string;
  to: string | null;
  input?: string | null;
  value: NumericValue;
  transactionFee: NumericValue;
}

const linkClass = 'text-base-blue hover:underline dark:text-bds-blue-20';

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

export function BlockTable({ blocks, chain }: { blocks: BlockSummary[]; chain: TipsChain }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="border-b border-bds-gray-10 bg-bds-gray-5/60 dark:border-white/10 dark:bg-white/[0.03]">
          <tr>
            <TableHeader>Block</TableHeader>
            <TableHeader>Age</TableHeader>
            <TableHeader>Txn</TableHeader>
            <TableHeader>Gas Used</TableHeader>
            <TableHeader>Gas Limit</TableHeader>
            <TableHeader>Base Fee</TableHeader>
          </tr>
        </thead>
        <tbody className="divide-y divide-bds-gray-10 dark:divide-white/10">
          {blocks.map((block) => (
            <tr key={block.hash} className="hover:bg-bds-gray-5/60 dark:hover:bg-white/5">
              <Cell>
                <Link href={tipsHref(`/block/${block.number}`, chain)} className={cn('font-medium', linkClass)}>
                  #{formatInteger(block.number)}
                </Link>
                <div className="mt-0.5 font-mono text-xs text-bds-gray-50 dark:text-bds-gray-40">
                  {shortHash(block.hash)}
                </div>
              </Cell>
              <Cell className="whitespace-nowrap text-bds-gray-60 dark:text-bds-gray-40">
                {formatAge(block.timestamp)}
              </Cell>
              <Cell>{formatInteger(block.transactionCount)}</Cell>
              <Cell className="whitespace-nowrap">{formatInteger(block.gasUsed)}</Cell>
              <Cell className="whitespace-nowrap">{formatInteger(block.gasLimit)}</Cell>
              <Cell className="whitespace-nowrap">{formatGwei(block.baseFeePerGas)}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TransactionTable({
  transactions,
  chain,
  emptyMessage = 'No transactions found',
}: {
  transactions: TransactionTableItem[];
  chain: TipsChain;
  emptyMessage?: string;
}) {
  if (transactions.length === 0) {
    return (
      <div className="py-12 text-center text-bds-gray-60 dark:text-bds-gray-40">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-sm">
        <thead className="border-b border-bds-gray-10 bg-bds-gray-5/60 dark:border-white/10 dark:bg-white/[0.03]">
          <tr>
            <TableHeader>Transaction Hash</TableHeader>
            <TableHeader>Action</TableHeader>
            <TableHeader>Block</TableHeader>
            <TableHeader>Age</TableHeader>
            <TableHeader>From</TableHeader>
            <TableHeader>To</TableHeader>
            <TableHeader>Amount</TableHeader>
            <TableHeader>Txn Fee</TableHeader>
          </tr>
        </thead>
        <tbody className="divide-y divide-bds-gray-10 dark:divide-white/10">
          {transactions.map((transaction) => (
            <tr key={transaction.hash} className="hover:bg-bds-gray-5/60 dark:hover:bg-white/5">
              <Cell>
                <Link
                  href={tipsHref(`/txn/${transaction.hash}`, chain)}
                  className={cn('font-mono', linkClass)}
                  title={transaction.hash}
                >
                  {shortHash(transaction.hash)}
                </Link>
              </Cell>
              <Cell className="whitespace-nowrap">
                {formatAction(transaction.input, transaction.to)}
              </Cell>
              <Cell className="whitespace-nowrap">
                <Link
                  href={tipsHref(`/block/${String(transaction.blockNumber)}`, chain)}
                  className={linkClass}
                >
                  #{formatInteger(transaction.blockNumber)}
                </Link>
                {transaction.transactionIndex !== undefined && (
                  <div className="mt-0.5 text-xs text-bds-gray-50 dark:text-bds-gray-40">
                    Index {formatInteger(transaction.transactionIndex)}
                  </div>
                )}
              </Cell>
              <Cell className="whitespace-nowrap text-bds-gray-60 dark:text-bds-gray-40">
                {formatAge(transaction.blockTimestamp)}
              </Cell>
              <Cell className="font-mono text-xs text-bds-gray-60 dark:text-bds-gray-40">
                <span title={transaction.from}>{shortAddress(transaction.from)}</span>
              </Cell>
              <Cell className="font-mono text-xs text-bds-gray-60 dark:text-bds-gray-40">
                <span title={transaction.to ?? undefined}>{shortAddress(transaction.to)}</span>
              </Cell>
              <Cell className="whitespace-nowrap">{formatEth(transaction.value)}</Cell>
              <Cell className="whitespace-nowrap">{formatEth(transaction.transactionFee)}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
