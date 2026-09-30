'use client';

// Management view shown when the explorer address is one of your local accounts.
// This is the `@aa`-heavy surface (signing, engine), so the page loads it via
// next/dynamic — the public inspector path never pulls it in.
//
// Wraps the account engine in a provider, pins it to the account matching the
// route address, and renders Overview / Delegation / Activity, with delegation
// changes sent through the shared Transact review+wait dialog.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Spinner } from '../../../../components/ui/Spinner';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import type { ExplorerAddressResponse } from '../../../library/api-types';
import { Badge, KindBadge } from '../../../demos/_shared/primitives';
import { TransactionModal, type TransactPreset } from '../../../demos/account/components/TransactionModal';
import { shortAddress } from '../../../library/format';
import { AccountEngineProvider, useAccountEngine } from '../../../demos/account/useAccountEngine';
import { AccountShell, useSectionParam, type ShellSection } from './AccountShell';
import { ActivityTable } from './ActivityTable';
import { AssetsCard } from './AssetsCard';

const SECTIONS: ShellSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'delegation', label: 'Delegation' },
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

  const badges = acct ? (
    <>
      <Badge>EOA</Badge>
      {engineReady && engine.delegationTarget ? <Badge tone="blue">Delegated</Badge> : null}
    </>
  ) : null;

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
            ) : section === 'delegation' ? (
              <DelegationSection openTransaction={openTransaction} />
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

function DefinitionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-bds-gray-10 pb-3 text-[13px] last:border-b-0 last:pb-0 dark:border-white/10">
      <span className="text-bds-gray-50">{label}</span>
      <span className="font-normal">{value}</span>
    </div>
  );
}

function DelegationSection({ openTransaction }: { openTransaction: (preset?: TransactPreset) => void }) {
  const engine = useAccountEngine();
  const signer = engine.activeSigner;
  const target = engine.delegationTarget;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5 bg-background p-5 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-1">
          <Text variant="headline">Code delegation</Text>
          <Text variant="label.regular" tone="muted" className="max-w-xl">
            An EOA can point at a contract and run its code (EIP-7702-style), set or cleared by a delegation change in
            one of its own transactions. Nothing is delegated unless you choose to.
          </Text>
        </div>
        <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-4 dark:border-white/10">
          <DefinitionRow
            label="Current target"
            value={target === undefined ? 'Loading…' : target ? shortAddress(target) : 'None'}
          />
          {signer ? (
            <div className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-bds-gray-50">Key</span>
              <span className="flex items-center gap-1.5 font-normal">
                <KindBadge kind={signer.kind} />
                {signer.label}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => openTransaction({ delegation: 'set' })}>
            {target ? 'Change delegation' : 'Delegate code'}
          </Button>
          {target ? (
            <Button variant="secondary" size="sm" onClick={() => openTransaction({ delegation: 'clear' })}>
              Clear delegation
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
