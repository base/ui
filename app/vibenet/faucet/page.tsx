'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent, ReactNode } from 'react';

import { trackFaucetRequest } from '../../analytics/events';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';
import { ExplorerLink } from '../components/ExplorerLink';
import { FAUCET_TOKENS, faucetTokenLabel } from '../data/faucetTokens';
import type { FaucetStatusResponse } from '../library/api-types';
import { vibenetApi, VibenetApiError } from '../library/client';
import { isAddress, shortAddress } from '../library/format';
import type { DripState, FaucetTokenId } from '../library/types';

const RESULT_CLASSES: Record<DripState['phase'], string> = {
  idle: '',
  pending: 'border-bds-gray-10 text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40',
  success:
    'border-bds-green-20 bg-bds-green-0 text-bds-green-70 dark:border-bds-green-80 dark:bg-bds-green-100/40 dark:text-bds-green-20',
  error:
    'border-bds-red-20 bg-bds-red-0 text-bds-red-70 dark:border-bds-red-80 dark:bg-bds-red-100/40 dark:text-bds-red-20',
};

function dripErrorMessage(err: unknown): string {
  if (err instanceof VibenetApiError) {
    if (err.status === 429) return 'rate limited — wait a minute and try again';
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export default function FaucetPage() {
  const [status, setStatus] = useState<FaucetStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [drip, setDrip] = useState<DripState>({ phase: 'idle' });

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

  const handleAddressChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setAddress(event.target.value);
  }, []);

  const validAddress = isAddress(address);

  let summaryBody: ReactNode;
  if (statusError) {
    summaryBody = (
      <Text variant="label.regular" tone="muted">
        Could not load faucet status: {statusError}
      </Text>
    );
  } else if (!status) {
    summaryBody = (
      <Text variant="label.regular" tone="muted">
        Loading status…
      </Text>
    );
  } else {
    const loaded = status;
    summaryBody = (
      <div className="flex flex-wrap gap-3">
        {FAUCET_TOKENS.map((token) => (
          <div
            key={token.id}
            className="flex items-center gap-2 rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3 py-2 dark:border-white/10 dark:bg-white/5"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
              {token.label}
            </span>
            <span className="text-[13px] font-medium text-black dark:text-white">
              {token.summaryValue(loaded)}
            </span>
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
        <div className="font-medium">{faucetTokenLabel(drip.tokenId)} request submitted</div>
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
    <div className="flex flex-col gap-10 pb-4 text-black dark:text-white">
      <header className="flex flex-col gap-4 border-b border-bds-gray-10 pb-10 dark:border-white/10">
        <div className="max-w-3xl">
          <Text variant="caption" className="mb-4 text-base-blue dark:text-white">
            Base Vibenet
          </Text>
          <Text variant="display" className="text-balance">
            Faucet
          </Text>
          <Text variant="body" tone="muted" className="mt-5 max-w-2xl">
            Drip testnet ETH or mint USDV (Vibe USD) / NFV (NFT) to any address.
          </Text>
        </div>
      </header>

      <Card className="bg-white p-6 dark:bg-white/5">{summaryBody}</Card>

      <Card className="flex flex-col gap-5 bg-white p-6 dark:bg-white/5">
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <label htmlFor="faucet-address" className="flex flex-col gap-2 text-[14px] font-medium">
            Recipient address
            <input
              id="faucet-address"
              type="text"
              aria-label="Recipient address"
              value={address}
              onChange={handleAddressChange}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3.5 py-2.5 font-mono text-[14px] font-normal text-black outline-none transition-colors placeholder:text-bds-gray-40 focus:border-bds-blue-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-bds-gray-60 dark:focus:border-bds-blue-40"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            {FAUCET_TOKENS.map((token) => {
              const enabled = status ? token.isEnabled(status) : token.id === 'eth';
              return (
                <Button
                  key={token.id}
                  type="button"
                  data-token={token.id}
                  onClick={handleDripClick}
                  variant={token.id === 'eth' ? 'primary' : 'secondary'}
                  disabled={busy || !validAddress || !enabled}
                  className="disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {token.actionLabel(status)}
                </Button>
              );
            })}
          </div>
        </form>

        {drip.phase !== 'idle' ? (
          <div
            aria-live="polite"
            className={cn('rounded-lg border px-4 py-3 text-[14px]', RESULT_CLASSES[drip.phase])}
          >
            {resultBody}
          </div>
        ) : null}
      </Card>

      {addressChips.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-bds-gray-10 pt-6 dark:border-white/10">
          {addressChips.map((chip) => (
            <ExplorerLink
              key={chip.label}
              kind="address"
              value={chip.address}
              label={`${chip.label} ${shortAddress(chip.address)}`}
              className="rounded-full border border-bds-gray-10 px-3 py-1 text-[12px] hover:border-bds-gray-15 hover:no-underline dark:border-white/10 dark:hover:border-white/20"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
