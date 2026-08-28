'use client';

// Assets for an address: ETH + the stablecoin, plus any B20 tokens the address
// created (from the B20 demo's localStorage) or has transacted with (from the
// account's indexed activity). Self-contained and `@aa`-free — it fetches its
// own balances — so both the public inspector and the owned management view use
// the same component. `canTopUp` adds a faucet button for accounts you own.

import type { Address } from 'viem';
import { useEffect, useMemo, useState } from 'react';

import { Card } from '../../../../components/ui/Card';
import type { ActivityRow, AccountBalancesResponse } from '../../../library/api-types';
import { vibenetApi } from '../../../library/client';
import { formatEthWei } from '../../../demos/account/library/model';
import { formatTokenAmount } from '../../../demos/account/shared';
import { client } from '../../../demos/b20/lib/constants';
import { b20Abi } from '../../../demos/b20/lib/protocol';
import { readRecent } from '../../../demos/b20/lib/recent';

type TokenRow = { id: string; symbol: string; balance: string };

function AssetIcon({ symbol }: { symbol: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bds-gray-10 text-[11px] font-medium text-bds-gray-70 dark:bg-white/10 dark:text-bds-gray-30">
      {symbol === 'ETH' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2L5.5 12.2 12 16l6.5-3.8L12 2Z" fill="currentColor" opacity="0.55" />
          <path d="M12 17.3 5.5 13.5 12 22l6.5-8.5L12 17.3Z" fill="currentColor" />
        </svg>
      ) : (
        symbol.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function AssetsCard({
  address,
  activity,
  refreshSignal = 0,
}: {
  address: string;
  activity: ActivityRow[];
  /** Bump to force a balance refetch (e.g. after a faucet top-up). */
  refreshSignal?: number;
}) {
  const [bals, setBals] = useState<AccountBalancesResponse | null>(null);
  const [tokenRows, setTokenRows] = useState<TokenRow[]>([]);

  // Native balances (ETH + stablecoin).
  useEffect(() => {
    let cancelled = false;
    setBals(null);
    vibenetApi.account
      .balances(address, 'vibenet')
      .then((b) => {
        if (!cancelled) setBals(b);
      })
      .catch(() => {
        if (!cancelled) setBals({ eth_wei: null, usdv: null, usdv_decimals: null, usdv_symbol: null });
      });
    return () => {
      cancelled = true;
    };
  }, [address, refreshSignal]);

  // B20 token balances: created (localStorage, with metadata) + tokens seen in
  // this address's on-chain activity (metadata read on-chain).
  // Distinct token addresses from the address's activity, as a stable key so the
  // fetch below only re-runs when the token set actually changes (not on every
  // render — `activity` is often a fresh array identity).
  const seenTokenKey = useMemo(
    () =>
      Array.from(new Set(activity.map((r) => r.token).filter((t): t is string => !!t).map((t) => t.toLowerCase())))
        .sort()
        .join(','),
    [activity],
  );

  useEffect(() => {
    const owner = address as Address;
    const created = readRecent(owner);
    const createdSet = new Set(created.map((t) => t.address.toLowerCase()));
    const seenTokens = (seenTokenKey ? seenTokenKey.split(',') : []).filter(
      (a) => !createdSet.has(a),
    ) as Address[];

    let cancelled = false;
    const balanceOf = (token: Address) =>
      client.readContract({ address: token, abi: b20Abi, functionName: 'balanceOf', args: [owner] }) as Promise<bigint>;

    void (async () => {
      // Created and seen batches are independent — run them concurrently.
      const [createdRows, seenRows] = await Promise.all([
        Promise.all(
          created.map(async (t): Promise<TokenRow | null> => {
            try {
              return { id: t.address, symbol: t.symbol, balance: formatTokenAmount(await balanceOf(t.address), t.decimals) };
            } catch {
              return null;
            }
          }),
        ),
        Promise.all(
          seenTokens.map(async (addr): Promise<TokenRow | null> => {
            try {
              const [sym, dec, bal] = (await Promise.all([
                client.readContract({ address: addr, abi: b20Abi, functionName: 'symbol' }),
                client.readContract({ address: addr, abi: b20Abi, functionName: 'decimals' }),
                balanceOf(addr),
              ])) as [string, number, bigint];
              // Skip empty holdings and the stablecoin (shown as its own row).
              if (bal === 0n || sym === 'USDV') return null;
              return { id: addr, symbol: sym, balance: formatTokenAmount(bal, dec) };
            } catch {
              return null;
            }
          }),
        ),
      ]);
      if (!cancelled) setTokenRows([...createdRows, ...seenRows].filter((r): r is TokenRow => r !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, [address, seenTokenKey, refreshSignal]);

  const loading = bals === null;
  const stable = bals?.usdv_symbol ?? 'USDV';
  const rows: TokenRow[] = [
    { id: 'eth', symbol: 'ETH', balance: loading ? '…' : formatEthWei(bals?.eth_wei) },
    { id: 'stable', symbol: stable, balance: loading ? '…' : formatTokenAmount(bals?.usdv, bals?.usdv_decimals) },
    ...tokenRows,
  ];

  return (
    <Card className="overflow-hidden bg-background dark:bg-white/[0.03]">
      <div className="border-b border-bds-gray-10 px-5 py-2.5 dark:border-white/10">
        <span className="text-[13px] font-normal text-bds-gray-50">Assets</span>
      </div>
      {rows.map((asset) => (
        <div
          key={asset.id}
          className="flex items-center gap-3 border-b border-bds-gray-10 px-5 py-2.5 last:border-b-0 dark:border-white/10"
        >
          <AssetIcon symbol={asset.symbol} />
          <span className="text-[14px] font-normal">{asset.symbol}</span>
          <span className="ml-auto font-sans text-[14px]">{asset.balance}</span>
        </div>
      ))}
    </Card>
  );
}
