'use client';

import { use, useEffect, useState } from 'react';

import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { DetailList, DetailRow } from '../../../components/DetailList';
import { ExplorerLink } from '../../../components/ExplorerLink';
import type { ExplorerBlockResponse } from '../../../library/api-types';
import { vibenetApi, VibenetApiError } from '../../../library/client';
import { fmtHexInt, hexToInt, timeFromHex } from '../../../library/explorer';

type PageProps = {
  params: Promise<{ hash: string }>;
};

export default function ExplorerBlockPage({ params }: PageProps) {
  const { hash } = use(params);
  const [block, setBlock] = useState<ExplorerBlockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    vibenetApi.explorer
      .block(hash)
      .then((next) => {
        if (!cancelled) setBlock(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof VibenetApiError && err.status === 404
              ? 'Block not found'
              : 'Failed to fetch block',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  const num = block ? hexToInt(block.number) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text variant="title2">Block {num !== null ? num.toLocaleString() : ''}</Text>
        {block ? (
          <code className="mt-1 block break-all font-mono text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
            {block.hash}
          </code>
        ) : null}
      </div>

      {loading ? (
        <Text variant="label.regular" tone="muted">
          Loading…
        </Text>
      ) : null}
      {error ? (
        <Card className="bg-white p-4 dark:bg-white/5">
          <Text variant="label.regular" tone="muted">
            {error}
          </Text>
        </Card>
      ) : null}

      {block ? (
        <>
          <Card className="bg-white p-6 dark:bg-white/5">
            <DetailList>
              <DetailRow label="Number">{num?.toLocaleString() ?? '—'}</DetailRow>
              <DetailRow label="Timestamp">{timeFromHex(block.timestamp)?.human ?? '—'}</DetailRow>
              <DetailRow label="Miner">
                <ExplorerLink
                  kind="address"
                  value={block.miner}
                  label={block.miner}
                  className="break-all"
                />
              </DetailRow>
              <DetailRow label="Parent">
                {num && num > 0 ? (
                  <ExplorerLink
                    kind="block"
                    value={block.parentHash}
                    label={block.parentHash}
                    className="break-all"
                  />
                ) : (
                  <code className="break-all font-mono">{block.parentHash}</code>
                )}
              </DetailRow>
              <DetailRow label="Gas Used">{fmtHexInt(block.gasUsed)}</DetailRow>
              <DetailRow label="Gas Limit">{fmtHexInt(block.gasLimit)}</DetailRow>
              <DetailRow label="Base Fee">
                {block.baseFeePerGas ? `${fmtHexInt(block.baseFeePerGas)} wei` : '—'}
              </DetailRow>
            </DetailList>
          </Card>

          <section className="flex flex-col gap-3">
            <Text variant="title3">Transactions ({block.transactions.length})</Text>
            {block.transactions.length === 0 ? (
              <Card className="bg-white p-4 dark:bg-white/5">
                <Text variant="label.regular" tone="muted">
                  No transactions in this block.
                </Text>
              </Card>
            ) : (
              <Card className="overflow-hidden bg-white dark:bg-white/5">
                <ul className="divide-y divide-bds-gray-10 dark:divide-white/10">
                  {block.transactions.map((txHash, index) => (
                    <li key={txHash} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                      <span className="w-8 shrink-0 text-bds-gray-60 dark:text-bds-gray-40">
                        {index}
                      </span>
                      <ExplorerLink kind="tx" value={txHash} label={txHash} className="truncate" />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
