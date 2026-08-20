'use client';

import Link from 'next/link';
import { parseEventLogs, zeroAddress, type Address, type Hex } from 'viem';
import { useEffect, useState } from 'react';

import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { client } from '../lib/constants';
import { bytes32ToMemo, formatAmount, shortAddress } from '../lib/protocol';

const MAX_BLOCK_RANGE = 100_000n;

const memoEvent = {
  type: 'event',
  name: 'Memo',
  inputs: [
    { indexed: true, name: 'caller', type: 'address' },
    { indexed: true, name: 'memo', type: 'bytes32' },
  ],
} as const;

const transferEvent = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const;

type MemoRow = {
  caller: Address;
  memo: Hex;
  memoText: string | null;
  hash: Hex;
  from?: Address;
  to?: Address;
  value?: bigint;
  operation: 'mint' | 'transfer';
};

export function MemoHistory({
  address,
  decimals,
  symbol,
  refreshKey = 0,
}: {
  address: Address;
  decimals: number;
  symbol: string;
  /** Bump to re-read the log history (e.g. after the demo sends a transaction). */
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<MemoRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    // Only show the loading state on first mount for a token — refreshes after
    // a send keep the current rows on screen instead of flashing empty.
    setState((previous) => (previous === 'ready' ? previous : 'loading'));

    const loadMemoLogs = async () => {
      const latestBlock = await client.getBlockNumber({ cacheTime: 0 });
      const logs = [] as Awaited<ReturnType<typeof client.getLogs<typeof memoEvent>>>;
      let toBlock = latestBlock;
      while (true) {
        const fromBlock = toBlock >= MAX_BLOCK_RANGE - 1n ? toBlock - (MAX_BLOCK_RANGE - 1n) : 0n;
        logs.push(...(await client.getLogs({ address, event: memoEvent, fromBlock, toBlock })));
        if (fromBlock === 0n) return logs;
        toBlock = fromBlock - 1n;
      }
    };

    const load = () => loadMemoLogs()
      .then(async (memoLogs) => {
        if (cancelled) return;
        const nextRows = await Promise.all(
          memoLogs
            .slice()
            .reverse()
            .map(async (memoLog) => {
              const caller = memoLog.args.caller;
              const memo = memoLog.args.memo;
              if (!caller || !memo) return null;
              const receipt = await client.getTransactionReceipt({ hash: memoLog.transactionHash });
              const transfer = parseEventLogs({ abi: [transferEvent], logs: receipt.logs, eventName: 'Transfer' })
                .filter((transferLog) => transferLog.logIndex < memoLog.logIndex)
                .at(-1);
              return {
                caller,
                memo,
                memoText: bytes32ToMemo(memo),
                hash: memoLog.transactionHash,
                ...(transfer ? { from: transfer.args.from, to: transfer.args.to, value: transfer.args.value } : {}),
                operation: transfer?.args.from?.toLowerCase() === zeroAddress ? 'mint' : 'transfer',
              };
            }),
        );
        if (cancelled) return;
        setRows(nextRows.filter((row): row is MemoRow => row !== null));
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    void load();
    // Log reads lag inclusion by ~1 block, so a refresh right after a send can
    // miss the newest memo — read again once the state settles.
    const settle = window.setTimeout(() => void load(), 2_500);
    return () => {
      cancelled = true;
      window.clearTimeout(settle);
    };
  }, [address, refreshKey]);

  return (
    <Card className="bg-background p-5 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text variant="headline">Onchain memo history</Text>
          <Text variant="footnote" tone="muted">
            Memos recorded for the token you selected in Policies.
          </Text>
        </div>
        {state === 'ready' ? (
          <span className="text-[12px] text-bds-gray-50">
            {rows.length} memo{rows.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      {state === 'loading' ? <p className="mt-4 text-[13px] text-bds-gray-50">Loading memo events…</p> : null}
      {state === 'error' ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-bds-red-0 p-3 text-[13px] text-bds-red-70"
        >
          We could not load memo history yet. Try again after the transaction appears in the explorer.
        </p>
      ) : null}
      {state === 'ready' && !rows.length ? (
        <p className="mt-4 rounded-lg bg-bds-gray-5 p-3 text-[13px] text-bds-gray-60 dark:bg-white/10">
          This token does not have any memo events yet.
        </p>
      ) : null}
      {state === 'ready' && rows.length ? (
        <div className="mt-4 divide-y divide-bds-gray-10 border-t border-bds-gray-10 dark:divide-white/10 dark:border-white/10">
          {rows.map((row) => (
            <div key={`${row.hash}-${row.memo}`} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] text-bds-gray-50">Memo</p>
                  <p className="mt-1 text-[16px] font-medium">{row.memoText ?? shortAddress(row.memo)}</p>
                  {!row.memoText ? <p className="mt-1 font-mono text-[11px] text-bds-gray-50">{row.memo}</p> : null}
                </div>
                <Link
                  href={`${VIBENET_EXPLORER_PATH}/tx/${row.hash}`}
                  className="text-[12px] text-base-blue hover:underline"
                >
                  View transaction ↗
                </Link>
              </div>
              <dl className="mt-4 grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <dt className="text-bds-gray-50">Operation</dt>
                  <dd className="mt-0.5 font-medium">
                    {row.operation === 'mint' ? 'Mint with memo' : 'Transfer with memo'}
                  </dd>
                </div>
                <div>
                  <dt className="text-bds-gray-50">Memo caller</dt>
                  <dd className="mt-0.5 font-mono">{shortAddress(row.caller)}</dd>
                </div>
                {row.from ? (
                  <div>
                    <dt className="text-bds-gray-50">From</dt>
                    <dd className="mt-0.5 font-mono">{shortAddress(row.from)}</dd>
                  </div>
                ) : null}
                {row.to ? (
                  <div>
                    <dt className="text-bds-gray-50">To</dt>
                    <dd className="mt-0.5 font-mono">{shortAddress(row.to)}</dd>
                  </div>
                ) : null}
                {row.value !== undefined ? (
                  <div>
                    <dt className="text-bds-gray-50">Amount</dt>
                    <dd className="mt-0.5">
                      {formatAmount(row.value, decimals)} {symbol}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
