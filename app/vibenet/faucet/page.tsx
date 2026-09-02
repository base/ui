'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, MouseEvent, ReactNode } from 'react';

import Link from 'next/link';

import { trackFaucetRequest } from '../../analytics/events';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { ExplorerLink } from '../components/ExplorerLink';
import { FAUCET_TOKENS, faucetTokenLabel } from '../data/faucetTokens';
import { AddressAutocomplete } from '../demos/_shared/AddressAutocomplete';
import { useAccounts } from '../demos/account/useAccounts';
import type { FaucetStatusResponse } from '../library/api-types';
import { vibenetApi, VibenetApiError } from '../library/client';
import { VIBENET_EXPLORER_PATH } from '../library/config';
import { isAddress, shortAddress } from '../library/format';
import type { DripState, FaucetTokenId } from '../library/types';
import { defaultFaucetRecipient } from './recipient';

const RESULT_CLASSES: Record<DripState['phase'], string> = {
  idle: '',
  pending: 'border-bds-gray-10 text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40',
  success:
    'border-bds-green-20 bg-bds-green-0 text-bds-green-70',
  error:
    'border-bds-red-20 bg-bds-red-0 text-bds-red-70',
};

function dripErrorMessage(err: unknown): string {
  if (err instanceof VibenetApiError) {
    if (err.status === 429) return 'rate limited — wait a minute and try again';
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export default function FaucetPage() {
  const { accounts, activeAccountId, hydrated } = useAccounts();
  const [status, setStatus] = useState<FaucetStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [addressOverride, setAddressOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drip, setDrip] = useState<DripState>({ phase: 'idle' });

  const addressBook = useMemo(
    () => accounts.map(({ label, address }) => ({ label, address })),
    [accounts],
  );

  // Start with the selected local demo account when one is available. Once the
  // visitor types or pastes anything, their input takes precedence (including
  // an intentionally blank field).
  const address =
    addressOverride ?? (hydrated ? defaultFaucetRecipient(accounts, activeAccountId) : null) ?? '';

  useEffect(() => {
    let cancelled = false;
    function load() {
      vibenetApi.faucet
        .status()
        .then((next) => {
          if (!cancelled) {
            setStatus(next);
            setStatusError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setStatusError(err instanceof Error ? err.message : String(err));
        });
    }
    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const refreshStatus = useCallback(() => {
    vibenetApi.faucet
      .status()
      .then(setStatus)
      .catch(() => {});
  }, []);

  const runDrip = useCallback(
    async (tokenId: FaucetTokenId) => {
      const token = FAUCET_TOKENS.find((entry) => entry.id === tokenId);
      if (!token) return;
      if (!isAddress(address)) {
        setDrip({ phase: 'error', tokenId, message: 'Enter a valid 0x address' });
        return;
      }
      setBusy(true);
      setDrip({ phase: 'pending', tokenId });
      trackFaucetRequest(tokenId, 'submitted');

      try {
        const outcome = await token.drip(address);
        setDrip({ phase: 'success', tokenId, outcome });
        trackFaucetRequest(tokenId, 'success');
      } catch (err) {
        setDrip({ phase: 'error', tokenId, message: dripErrorMessage(err) });
        trackFaucetRequest(tokenId, 'error');
      } finally {
        setBusy(false);
        refreshStatus();
      }
    },
    [address, refreshStatus],
  );

  const handleDripClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const tokenId = event.currentTarget.dataset.token as FaucetTokenId | undefined;
      if (tokenId) void runDrip(tokenId);
    },
    [runDrip],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void runDrip('eth');
    },
    [runDrip],
  );

  const validAddress = isAddress(address);

  let summaryBody: ReactNode;
  if (statusError) {
    summaryBody = (
      <Text variant="label.regular" tone="muted">
        Could not load faucet status: {statusError}
      </Text>
    );
  } else if (!status) {
    // Placeholder chips, not a line of text: the loaded row is 36px tall, so a 20px
    // "Loading status…" line shifted the whole page down 16px when status arrived.
    // Same geometry as ./loading.tsx.
    summaryBody = (
      <div className="flex flex-wrap gap-3" aria-busy="true" aria-label="Loading faucet status">
        {FAUCET_TOKENS.map((token) => (
          <Skeleton key={token.id} className="h-9 w-28 rounded-lg" />
        ))}
      </div>
    );
  } else {
    const loaded = status;
    summaryBody = (
      <div className="flex flex-wrap gap-3">
        {FAUCET_TOKENS.map((token) => (
          <div
            key={token.id}
            className="flex items-center gap-2 rounded-lg bg-bds-gray-0 px-3 py-2 dark:bg-white/5"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
              {token.label}
            </span>
            {token.summaryValue(loaded) === 'Ready' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-bds-green-0 px-2 py-0.5 text-[12px] leading-none text-bds-green-70">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-gentle-ping absolute inline-flex h-full w-full rounded-full bg-bds-green-40" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-bds-green-40" />
                </span>
                Ready
              </span>
            ) : (
              <span className="text-[13px] text-foreground">
                {token.summaryValue(loaded)}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  let resultBody: ReactNode = null;
  if (drip.phase === 'pending') {
    resultBody = (
      <span>
        {drip.tokenId === 'eth' ? 'Requesting ETH…' : `Minting ${faucetTokenLabel(drip.tokenId)}…`}
      </span>
    );
  } else if (drip.phase === 'error') {
    resultBody = (
      <span>
        {faucetTokenLabel(drip.tokenId)} request failed: {drip.message}
      </span>
    );
  } else if (drip.phase === 'success') {
    const { outcome } = drip;
    resultBody = (
      <>
        <div>{faucetTokenLabel(drip.tokenId)} request submitted</div>
        <div className="mt-1 text-[13px]">
          Transaction <ExplorerLink kind="tx" value={outcome.txHash} /> →{' '}
          <ExplorerLink kind="address" value={outcome.to} />
          {outcome.via ? (
            <>
              {' '}
              via{' '}
              <ExplorerLink kind="address" value={outcome.via.address} label={outcome.via.label} />
            </>
          ) : null}
        </div>
      </>
    );
  }

  const addressChips = status
    ? [
        { label: 'Faucet', address: status.address },
        { label: 'USDV', address: status.usdv_address },
        { label: 'NFV', address: status.nfv_address },
      ].filter((chip): chip is { label: string; address: string } => isAddress(chip.address))
    : [];

  return (
    <div className="animate-in -mx-7 -mb-20 -mt-6 flex min-w-0 flex-1 flex-col gap-4 px-7 pt-6 pb-2 text-foreground">
      <div>{summaryBody}</div>

      <Card className="flex flex-col gap-3 bg-background p-6 dark:bg-white/5">
        <div className="flex flex-col gap-0.5">
          <Text variant="label.medium">Recipient Address</Text>
          <Text variant="label.medium" tone="muted">
            Send vibenet ETH, USDV (Vibe USD), NFV (NFT) to any address to start testing.
          </Text>
        </div>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-[14px]">
            <span className="sr-only">Recipient address</span>
            <AddressAutocomplete
              value={address}
              onChange={setAddressOverride}
              accounts={addressBook}
              placeholder="0x… recipient address or account name"
              className="px-3.5 py-2.5 text-[14px] font-normal text-foreground focus:border-foreground dark:text-white dark:focus:border-white/40"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            {FAUCET_TOKENS.map((token) => {
              const enabled = status ? token.isEnabled(status) : token.id === 'eth';
              return (
                <Button
                  key={token.id}
                  type="button"
                  size="sm"
                  data-token={token.id}
                  onClick={handleDripClick}
                  variant="secondary"
                  disabled={busy || !validAddress || !enabled}
                  className="disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {drip.phase === 'pending' && drip.tokenId === token.id ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : token.id === 'eth' ? (
                    <svg width={10} height={16} viewBox="0 0 21 35" fill="none" aria-hidden="true" className="mr-0.5">
                      <path d="M10.4976 0V12.7533L20.9934 17.5699L10.4976 0Z" fill="currentColor" fillOpacity={0.602} />
                      <path d="M10.4972 0L0 17.5699L10.4972 12.7533V0Z" fill="currentColor" />
                      <path d="M10.4976 25.8345V34.5001L21.0004 19.5771L10.4976 25.8345Z" fill="currentColor" fillOpacity={0.602} />
                      <path d="M10.4972 34.5001V25.833L0 19.5771L10.4972 34.5001Z" fill="currentColor" />
                      <path d="M10.4976 23.8288L20.9934 17.5701L10.4976 12.7563V23.8288Z" fill="currentColor" fillOpacity={0.2} />
                      <path d="M0 17.5701L10.4972 23.8288V12.7563L0 17.5701Z" fill="currentColor" fillOpacity={0.602} />
                    </svg>
                  ) : null}
                  {token.actionLabel(status)}
                </Button>
              );
            })}
          </div>
        </form>

        {drip.phase !== 'idle' ? (
          <div
            aria-live="polite"
            className={cn('animate-slide-down rounded-lg border px-4 py-3 text-[14px]', RESULT_CLASSES[drip.phase])}
          >
            {resultBody}
          </div>
        ) : null}
      </Card>

      {addressChips.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-x-8 gap-y-2 pt-6 pb-4 text-[12px]">
          {addressChips.map((chip, i) => (
            <Link
              key={chip.label}
              href={`${VIBENET_EXPLORER_PATH}/address/${chip.address}`}
              className={cn(
                'animate-in inline-flex gap-2 text-bds-gray-30 transition-colors hover:text-bds-gray-50 hover:no-underline',
                i === 1 && 'animate-in-delay-1',
                i === 2 && 'animate-in-delay-2',
              )}
            >
              <span>{chip.label}</span>
              <span>{shortAddress(chip.address)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
