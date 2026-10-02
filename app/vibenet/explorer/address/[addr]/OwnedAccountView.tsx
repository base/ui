'use client';

// Management view shown when the explorer address is one of your local accounts.
// This is the `@aa`-heavy surface (signing, engine), so the page loads it via
// next/dynamic — the public inspector path never pulls it in.
//
// Wraps the account engine in a provider, pins it to the account matching the
// route address, and renders Overview / Activity, with sends going through the
// shared Transact review+wait dialog.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../../../../components/ui/Button';
import { Spinner } from '../../../../components/ui/Spinner';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import type { ExplorerAddressResponse } from '../../../library/api-types';
import { Badge } from '../../../demos/_shared/primitives';
import { TransactionModal, type TransactPreset } from '../../../demos/account/components/TransactionModal';
import { AccountEngineProvider, useAccountEngine } from '../../../demos/account/useAccountEngine';
import { AccountShell, useSectionParam, type ShellSection } from './AccountShell';
import { ActivityTable } from './ActivityTable';
import { AssetsCard } from './AssetsCard';

const SECTIONS: ShellSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
];

export function OwnedAccountView({ address, data }: { address: string; data: ExplorerAddressResponse | null }) {
  return (
    <AccountEngineProvider>
      <OwnedInner address={address} data={data} />
    </AccountEngineProvider>
  );
}

function OwnedInner({ address, data }: { address: string; data: ExplorerAddressResponse | null }) {
  const engine = useAccountEngine();
  const router = useRouter();
  const [routeReady, setRouteReady] = useState(false);
  const [topUpTick, setTopUpTick] = useState(0);
  const [transactionRequest, setTransactionRequest] = useState<{ preset?: TransactPreset } | null>(null);
  const openTransaction = (preset?: TransactPreset) => {
    setTransactionRequest({ preset });
  };
  const [section, selectSection] = useSectionParam({
    valid: SECTIONS.map((s) => s.id),
    fallback: 'overview',
  });

  const lc = address.toLowerCase();
  const routeAcct = useMemo(
    () => engine.accounts.find((a) => a.address.toLowerCase() === lc) ?? null,
    [engine.accounts, lc],
  );

  // Pin the engine to the account for this address on first hydration.
  useEffect(() => {
    if (!engine.hydrated) return;
    if (routeAcct && engine.activeAccountId !== routeAcct.id) engine.setActiveAccountId(routeAcct.id);
    setRouteReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.hydrated, routeAcct?.id]);

  // Follow the active account (e.g. changed via the Transact "From" switcher) to
  // its own address page.
  useEffect(() => {
    if (!routeReady) return;
    const active = engine.accounts.find((a) => a.id === engine.activeAccountId);
    if (active && active.address.toLowerCase() !== lc) {
      router.push(`${VIBENET_EXPLORER_PATH}/address/${active.address}`);
    }
  }, [routeReady, engine.activeAccountId, engine.accounts, lc, router]);

  const acct = routeAcct;
  // `routeReady` is only set inside the pin effect, which early-returns until
  // `engine.hydrated`, so it already implies hydration.
  const engineReady = routeReady && engine.acct?.address.toLowerCase() === lc;

  const badges = acct ? <Badge>EOA</Badge> : null;

  return (
    <>
      <AccountShell
        name={acct?.label ?? 'Account'}
        address={address}
        avatarVariant="default"
        badges={badges}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={!engineReady || engine.faucetBusy !== null}
              onClick={async () => {
                await engine.requestFaucet();
                setTopUpTick((t) => t + 1);
              }}
            >
              {engine.faucetBusy ? 'Topping up…' : 'Top up'}
            </Button>
            <Button size="sm" onClick={() => openTransaction()} disabled={!engineReady}>
              Transact
            </Button>
          </>
        }
        sections={SECTIONS}
        activeSection={section}
        onSelectSection={selectSection}
      >
        {!engineReady || !acct ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner className="h-6 w-6 text-bds-gray-50" />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {section === 'overview' ? (
              <AssetsCard address={acct.address} activity={data?.activity ?? []} refreshSignal={topUpTick} />
            ) : (
              <ActivityTable activity={data?.activity ?? []} />
            )}
          </div>
        )}
      </AccountShell>

      {transactionRequest ? (
        <TransactionModal
          key={engine.activeAccountId ?? 'no-account'}
          onClose={() => {
            setTransactionRequest(null);
            // A landed transaction may have changed balances.
            setTopUpTick((tick) => tick + 1);
          }}
          preset={transactionRequest.preset}
        />
      ) : null}
    </>
  );
}
