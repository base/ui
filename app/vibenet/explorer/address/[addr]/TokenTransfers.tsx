'use client';

// Transfer history for an ERC-20 address. The explorer index only records that
// the contract was the transaction recipient, so this loads the receipts and
// recent Transfer logs and renders from / to / amount.

import { useEffect, useMemo, useState } from 'react';

import { Card } from '../../../../components/ui/Card';
import { Spinner } from '../../../../components/ui/Spinner';
import { Text } from '../../../../components/ui/Text';
import { ExplorerLink } from '../../../components/ExplorerLink';
import type { ActivityRow } from '../../../library/api-types';
import { fmtTokenAmount } from '../../../library/explorer';
import { fetchTokenTransfers, tokenMovement, type TokenTransfer } from '../../../library/token';
import { ActivityTable } from './ActivityTable';

const TH = 'whitespace-nowrap px-4 py-3 text-left text-[13px] font-normal text-bds-gray-50';
const TD = 'whitespace-nowrap px-4 py-3 text-[13px]';

function Party({ address, label }: { address: string; label: string | null }) {
  if (label) {
    return <span className="text-bds-gray-60 dark:text-bds-gray-40">{label}</span>;
  }
  return <ExplorerLink kind="address" value={address} />;
}

function TransferTable({ rows, symbol, decimals }: { rows: TokenTransfer[]; symbol: string; decimals: number }) {
  return (
    <Card className="overflow-hidden bg-background dark:bg-white/[0.03]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr aria-label="Column headers" className="border-b border-bds-gray-10 dark:border-white/10">
              <th className={TH}>Block</th>
              <th className={TH}>Tx</th>
              <th className={TH}>From</th>
              <th className={TH}>To</th>
              <th className={`${TH} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const kind = tokenMovement(row.from, row.to);
              return (
                <tr
                  key={`${row.txHash}-${row.logIndex}`}
                  className="border-b border-bds-gray-10 last:border-0 dark:border-white/10"
                >
                  <td className={TD}>
                    <ExplorerLink kind="block" value={String(row.blockNumber)} label={row.blockNumber.toLocaleString()} />
                  </td>
                  <td className={TD}>
                    <ExplorerLink kind="tx" value={row.txHash} />
                  </td>
                  <td className={TD}>
                    <Party address={row.from} label={kind === 'mint' ? 'Mint' : null} />
                  </td>
                  <td className={TD}>
                    <Party address={row.to} label={kind === 'burn' ? 'Burn' : null} />
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {fmtTokenAmount(row.amount, decimals)} {symbol}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function TokenTransfers({
  token,
  symbol,
  decimals,
  activity,
}: {
  token: string;
  symbol: string;
  decimals: number;
  activity: ActivityRow[];
}) {
  const [rows, setRows] = useState<TokenTransfer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const txHashes = useMemo(() => activity.map((row) => row.tx_hash), [activity]);
  const hashKey = txHashes.join(',');

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setFailed(false);
    fetchTokenTransfers(token, hashKey ? hashKey.split(',') : [])
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, hashKey]);

  if (failed) {
    return (
      <div className="flex flex-col gap-3">
        <Text variant="label.regular" tone="muted">
          Could not read transfer events for these transactions.
        </Text>
        <ActivityTable activity={activity} />
      </div>
    );
  }

  if (rows !== null && rows.length === 0 && activity.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <Text variant="label.regular" tone="muted">
          These transactions did not emit a Transfer event.
        </Text>
        <ActivityTable activity={activity} />
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3">
        <Spinner className="h-6 w-6 text-bds-gray-50" />
        <Text variant="label.regular" tone="muted">
          Loading transfers
        </Text>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="bg-background p-4 dark:bg-white/[0.03]">
        <Text variant="label.regular" tone="muted">
          No transfers yet.
        </Text>
      </Card>
    );
  }

  return <TransferTable rows={rows} symbol={symbol} decimals={decimals} />;
}
