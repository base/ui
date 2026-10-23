'use client';

// ERC-20 identity for a contract address: the facts the address index doesn't
// store (name, decimals, supply). Shared by the public inspector's overview.

import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { DetailList, DetailRow } from '../../../components/DetailList';
import { fmtTokenAmount } from '../../../library/explorer';
import type { Erc20Profile } from '../../../library/token';

export function TokenMark({ symbol, size = 52 }: { symbol: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-bds-gray-10 font-medium text-bds-gray-70 dark:bg-white/10 dark:text-bds-gray-30"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      aria-hidden="true"
    >
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function TokenOverview({ profile, codeSize }: { profile: Erc20Profile; codeSize: number }) {
  return (
    <Card className="bg-background p-6 dark:bg-white/[0.03]">
      <Text as="p" variant="label.regular" tone="muted">
        Total supply
      </Text>
      <Text as="p" variant="title2" className="mt-1 tabular-nums">
        {fmtTokenAmount(profile.totalSupply, profile.decimals)} {profile.symbol}
      </Text>
      <DetailList className="mt-6">
        <DetailRow label="Name">{profile.name}</DetailRow>
        <DetailRow label="Symbol">{profile.symbol}</DetailRow>
        <DetailRow label="Decimals">{profile.decimals}</DetailRow>
        <DetailRow label="Code">{codeSize.toLocaleString()} bytes</DetailRow>
      </DetailList>
    </Card>
  );
}
