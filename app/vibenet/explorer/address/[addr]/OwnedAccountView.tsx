'use client';

// Management view shown when the explorer address is one of your local accounts.
// This is the `@aa`-heavy surface (signing, WebAuthn, engine), so the page loads
// it via next/dynamic — the public inspector path never pulls it in.
//
// Wraps the account engine in a provider, pins it to the account matching the
// route address, and renders the same sections the old /vibenet/accounts/<id>
// page had (Overview / Owners / Session keys / Sub-accounts), with key changes
// applied through the shared Transact review+wait dialog.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import { Spinner } from '../../../../components/ui/Spinner';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import type { ExplorerAddressResponse } from '../../../library/api-types';
import { ConfirmTrashButton } from '../../../demos/_shared/ConfirmTrashButton';
import { Badge, KindBadge } from '../../../demos/_shared/primitives';
import { SessionKeyEditor } from '../../../demos/account/components/SessionKeyEditor';
import { useTransactModal, type TransactModal } from '../../../demos/account/components/TransactionModal';
import { DEMO_CHAINS } from '../../../demos/account/library/chains';
import { formatExpiry, scopeChips } from '../../../demos/account/library/model';
import { formatTokenAmount } from '../../../demos/account/shared';
import { OWNER_SCOPE_PRESETS, periodLabel, scopeLabel } from '../../../demos/account/library/policy';
import { KIND_LABEL, signerIdentity } from '../../../demos/account/shared';
import { shortAddress } from '../../../library/format';
import { AccountEngineProvider, type AccountEngine, useAccountEngine } from '../../../demos/account/useAccountEngine';
import { AccountShell, useSectionParam, type ShellSection } from './AccountShell';
import { ActivityTable } from './ActivityTable';
import { AssetsCard } from './AssetsCard';

const INPUT_CLS =
  'w-full rounded-lg border border-bds-gray-10 bg-background px-3.5 py-2.5 text-[14px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40';

const SECTIONS: ShellSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'owners', label: 'Owners' },
  { id: 'sessions', label: 'Session keys' },
  { id: 'subaccounts', label: 'Sub-accounts' },
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
  const transact = useTransactModal();
  const router = useRouter();
  const [routeReady, setRouteReady] = useState(false);
  const [topUpTick, setTopUpTick] = useState(0);
  const [section, selectSection] = useSectionParam(
    SECTIONS.map((s) => s.id),
    'overview',
  );

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

  // Closing the Transact modal may follow a landed send (or a staged owner/
  // session-key apply) that moved balances — bump the same refresh signal the
  // faucet top-up uses so AssetsCard re-fetches instead of showing stale data.
  const wasTransactOpen = useRef(false);
  useEffect(() => {
    if (wasTransactOpen.current && !transact.isOpen) setTopUpTick((t) => t + 1);
    wasTransactOpen.current = transact.isOpen;
  }, [transact.isOpen]);

  const badges = acct ? (
    <>
      {acct.type === 'eoa' ? <Badge>EOA</Badge> : <Badge>Smart account</Badge>}
      <Badge tone={acct.deployed ? 'ok' : 'default'}>{acct.deployed ? 'Deployed' : 'Not deployed'}</Badge>
    </>
  ) : null;

  return (
    <>
      <AccountShell
        name={acct?.label ?? 'Account'}
        address={address}
        avatarVariant={acct?.parentId ? 'spending' : 'default'}
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
            <Button size="sm" onClick={() => transact.open()} disabled={!engineReady}>
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
            <EngineBanners engine={engine} transact={transact} />
            {section === 'overview' ? (
              <AssetsCard address={acct.address} activity={data?.activity ?? []} refreshSignal={topUpTick} />
            ) : section === 'owners' ? (
              <OwnersSection engine={engine} transact={transact} />
            ) : section === 'sessions' ? (
              <SessionsSection engine={engine} transact={transact} />
            ) : section === 'subaccounts' ? (
              <SubAccountsSection engine={engine} />
            ) : (
              <ActivityTable activity={data?.activity ?? []} />
            )}
          </div>
        )}
      </AccountShell>

      {transact.modal}
    </>
  );
}

function EngineBanners({ engine, transact }: { engine: AccountEngine; transact: TransactModal }) {
  if (!engine.error && !engine.estimateBlocked && !engine.seqRecovery && !engine.infoMsg) return null;
  return (
    <div className="flex flex-col gap-3">
      {engine.error && !engine.estimateBlocked ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70">
          <span className="[line-break:anywhere]">{engine.error}</span>
          <button type="button" onClick={() => engine.setError('')} className="shrink-0">
            Dismiss
          </button>
        </div>
      ) : null}

      {engine.estimateBlocked ? (
        <div className="flex flex-col gap-2 rounded-xl border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70">
          <span className="[line-break:anywhere]">{engine.estimateBlocked}</span>
          <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
            Estimation reverted, so this will likely fail on-chain.
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={transact.signing}
              onClick={() => {
                engine.overrideEstimateRef.current = true;
                void transact.confirmSend();
              }}
            >
              Send Anyway
            </Button>
          </div>
        </div>
      ) : null}

      {engine.seqRecovery ? (
        <div className="flex flex-col gap-2 rounded-xl border border-bds-yellow-20 bg-bds-yellow-0 px-4 py-3 text-[13px] text-bds-yellow-70">
          <span>
            This {engine.seqRecovery.what} is out of sequence — the account&apos;s config changed since it was signed,
            so it can&apos;t land as-is. Re-sign it at the current sequence, or drop it.
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => engine.seqRecovery!.resign()} disabled={engine.seqRecovery.busy}>
              {engine.seqRecovery.busy ? 'Re-Signing…' : 'Re-Sign'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => engine.seqRecovery!.drop()} disabled={engine.seqRecovery.busy}>
              Drop It
            </Button>
          </div>
        </div>
      ) : null}

      {engine.infoMsg ? (
        <p className="flex items-center justify-between gap-3 rounded-xl border border-bds-gray-10 bg-bds-gray-0 px-4 py-3 text-[13px] text-bds-gray-70 dark:border-white/10 dark:bg-white/5">
          <span>{engine.infoMsg}</span>
          <button type="button" onClick={() => engine.setInfoMsg('')} className="shrink-0 text-[12px] text-bds-gray-60">
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
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

function OwnersSection({ engine, transact }: { engine: AccountEngine; transact: TransactModal }) {
  const acct = engine.acct!;
  const draftOwners = acct.owners
    .filter((owner) => engine.ownerDraft.includes(owner.signerId))
    .map((owner) => ({
      id: owner.signerId,
      label: owner.label,
      kind: owner.kind,
      identity: owner.identity,
      appliedScope: owner.scope ?? 0,
    }))
    .concat(
      engine.pendingAuthorize.map((signer) => ({
        id: signer.id,
        label: signer.label,
        kind: signer.kind,
        identity: signerIdentity(signer),
        appliedScope: 0,
      })),
    );
  const addable = engine.signers.filter((signer) => !engine.ownerDraft.includes(signer.id));

  const reviewOwnerChange = async () => {
    const ok = await engine.signOwnerChange();
    if (ok) transact.openApply('owner');
  };

  return (
    <div className="flex flex-col gap-8">

      <Card className="overflow-hidden bg-background dark:bg-white/[0.03]">
        <div className="hidden grid-cols-[minmax(0,1fr)_190px_40px] gap-4 border-b border-bds-gray-10 px-5 py-3 text-[12px] text-bds-gray-50 sm:grid dark:border-white/10">
          <span>Key</span>
          <span>Permissions</span>
          <span />
        </div>
        <div className="flex flex-col">
          {draftOwners.map((owner) => {
            const isNew = engine.pendingAuthorize.some((signer) => signer.id === owner.id);
            const isEoa = acct.type === 'eoa' && owner.id === acct.initialActors[0]?.signerId;
            const scope = engine.scopeDraft[owner.id] ?? owner.appliedScope;
            const preset = OWNER_SCOPE_PRESETS.find((item) => item.scope === scope)?.id ?? 'full';
            const changed = scope !== owner.appliedScope;
            return (
              <div
                key={owner.id}
                className={cn(
                  'grid grid-cols-1 gap-4 border-b border-bds-gray-10 px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_190px_40px] sm:items-center dark:border-white/10',
                  isNew && 'bg-bds-blue-0',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <KindBadge kind={owner.kind} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="truncate text-[14px] font-normal">{owner.label}</span>
                      {isEoa ? <Badge>EOA</Badge> : null}
                      {isNew ? <Badge tone="ok">New</Badge> : changed ? <Badge>Changed</Badge> : null}
                    </div>
                    <span className="font-sans text-[12px] text-bds-gray-50">{shortAddress(owner.identity)}</span>
                  </div>
                </div>
                <Select
                  ariaLabel={`Permissions for ${owner.label}`}
                  value={preset}
                  onValueChange={(value) =>
                    engine.setOwnerScope(owner.id, OWNER_SCOPE_PRESETS.find((item) => item.id === value)?.scope ?? 0)
                  }
                  options={OWNER_SCOPE_PRESETS.map((item) => ({ value: item.id, label: item.label }))}
                />
                <div className="flex justify-end">
                  <ConfirmTrashButton
                    label={isNew ? `Remove ${owner.label}` : `Revoke ${owner.label}`}
                    onConfirm={() => engine.stageRemoveOwner(owner.id, Boolean(isEoa && !isNew))}
                    disabled={draftOwners.length <= 1}
                    disabledTitle="An account needs at least one owner"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-4 bg-background p-5 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-1">
          <Text variant="headline">Add an owner</Text>
          <Text variant="label.regular" tone="muted">
            Use a key already in this browser or create a new one.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {addable.map((signer) => (
            <Button key={signer.id} variant="outline" size="sm" onClick={() => engine.stageAddOwner(signer.id)}>
              + {signer.label} · {KIND_LABEL[signer.kind]}
            </Button>
          ))}
          <Button variant="secondary" size="sm" onClick={() => void engine.mintOwner('k1')} disabled={engine.busy !== null}>
            + New K1 key
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void engine.mintOwner('passkey')} disabled={engine.busy !== null}>
            + New passkey
          </Button>
        </div>
      </Card>

      {engine.keyChangeCount > 0 ? (
        <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-bds-blue-20 bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:bg-[#141414]/95">
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-normal">
              {engine.keyChangeCount} pending owner change{engine.keyChangeCount === 1 ? '' : 's'}
            </span>
            <span className="text-[12px] text-bds-gray-50">
              {[
                ...engine.pendingAuthorize.map((item) => `add ${item.label}`),
                ...engine.pendingRevoke.map((item) => `remove ${item.label}`),
                ...engine.pendingScope.map((item) => `${item.label} → ${scopeLabel(item.toScope)}`),
              ].join(' · ')}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={engine.discardOwnerChanges} disabled={engine.applying}>
              Discard
            </Button>
            <Button size="sm" onClick={reviewOwnerChange} disabled={engine.applying}>
              {engine.applying ? 'Signing…' : 'Review transaction'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SessionsSection({ engine, transact }: { engine: AccountEngine; transact: TransactModal }) {
  const acct = engine.acct!;
  const [adding, setAdding] = useState(false);

  const handleRevoke = async (id: string) => {
    const outcome = await engine.revokeSessionKey(id);
    if (outcome === 'staged' || outcome === 'noop') transact.openApply({ session: id });
  };

  return (
    <div className="flex flex-col gap-6">
      {acct.sessionKeys.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {acct.sessionKeys.map((session) => {
            const live = Object.entries(engine.policyRemaining[session.id] ?? {});
            const applying = engine.skApplyingId === session.id;
            return (
              <Card key={session.id} className="flex flex-col gap-5 bg-background p-5 dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <KindBadge kind={session.kind} />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-normal">{session.label}</span>
                      <span className="font-sans text-[12px] text-bds-gray-50">{shortAddress(session.actorId)}</span>
                    </div>
                  </div>
                  {!session.pendingAuth && !session.pendingRevoke ? (
                    <ConfirmTrashButton label={`Revoke ${session.label}`} onConfirm={() => void handleRevoke(session.id)} />
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {scopeChips(session.scope).map((scope) => (
                    <Badge key={scope}>{scope}</Badge>
                  ))}
                  <Badge>{formatExpiry(session.expiry)}</Badge>
                  {session.pendingAuth ? <Badge tone="ok">Pending authorize</Badge> : null}
                  {session.pendingRevoke ? <Badge tone="error">Pending revoke</Badge> : null}
                </div>
                <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-4 dark:border-white/10">
                  <DefinitionRow label="Policy" value={session.policy?.label ?? 'None'} />
                  <DefinitionRow
                    label="Network"
                    value={DEMO_CHAINS.find((chain) => chain.id === session.chainId)?.name ?? String(session.chainId)}
                  />
                  {live.length > 0
                    ? live.map(([token, b]) => (
                        <DefinitionRow
                          key={token}
                          label="Remaining"
                          value={`${formatTokenAmount(b.remaining, b.decimals)} / ${formatTokenAmount(b.allowance, b.decimals)} ${b.symbol}${b.period ? ` ${periodLabel(b.period)}` : ''}`}
                        />
                      ))
                    : session.policy?.limits?.map((limit) => (
                        <DefinitionRow
                          key={limit.token}
                          label="Allowance"
                          value={`${formatTokenAmount(limit.allowance, limit.decimals)} ${limit.symbol}`}
                        />
                      ))}
                </div>
                {session.pendingAuth ? (
                  <div className="flex gap-2 border-t border-bds-gray-10 pt-4 dark:border-white/10">
                    <Button size="sm" onClick={() => transact.openApply({ session: session.id })} disabled={applying}>
                      Apply now
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void engine.revokeSessionKey(session.id)}>
                      Discard
                    </Button>
                  </div>
                ) : session.pendingRevoke ? (
                  <div className="flex gap-2 border-t border-bds-gray-10 pt-4 dark:border-white/10">
                    <Button size="sm" onClick={() => transact.openApply({ session: session.id })} disabled={applying}>
                      Apply revoke
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => engine.undoStagedRevoke(session.id)}>
                      Undo
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : !adding ? (
        <Card className="flex flex-col items-center gap-3 bg-background px-5 py-14 text-center dark:bg-white/[0.03]">
          <Text variant="headline">No session keys</Text>
          <Text variant="label.regular" tone="muted" className="max-w-md">
            Add a policy-gated key for an app, agent, or hot signer. It can be revoked without rotating your owners.
          </Text>
        </Card>
      ) : null}

      {adding ? (
        <Card className="bg-background p-5 dark:bg-white/[0.03] sm:p-6">
          <SessionKeyEditor onClose={() => setAdding(false)} />
        </Card>
      ) : (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            Add session key
          </Button>
        </div>
      )}
    </div>
  );
}

function SubAccountsSection({ engine }: { engine: AccountEngine }) {
  const acct = engine.acct!;
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const create = () => {
    setBusy(true);
    try {
      engine.doCreateSubAccount(label);
      setLabel('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {acct.subAccounts.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {acct.subAccounts.map((subAccount) => {
            const stored = engine.accounts.find(
              (candidate) => candidate.address.toLowerCase() === subAccount.address.toLowerCase(),
            );
            return (
              <Card key={subAccount.id} className="flex flex-col gap-5 bg-background p-5 dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-normal">{subAccount.label}</span>
                    <span className="font-sans text-[12px] text-bds-gray-50">{shortAddress(subAccount.address)}</span>
                  </div>
                  {stored ? (
                    <ConfirmTrashButton
                      label={`Delete ${subAccount.label}`}
                      onConfirm={() => engine.deleteAccount(stored.id)}
                    />
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-4 dark:border-white/10">
                  <DefinitionRow label="Control" value={`Delegated to ${shortAddress(subAccount.delegateTo)}`} />
                  <DefinitionRow label="Status" value={stored?.deployed ? 'Deployed' : 'Not deployed'} />
                </div>
                <div className="mt-auto flex gap-2">
                  <Button size="sm" href={`${VIBENET_EXPLORER_PATH}/address/${subAccount.address}`}>
                    Manage
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 bg-background px-5 py-14 text-center dark:bg-white/[0.03]">
          <Text variant="headline">No sub-accounts</Text>
          <Text variant="label.regular" tone="muted" className="max-w-md">
            Separate an app or workflow into its own address without giving up control from this account.
          </Text>
        </Card>
      )}

      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setLabel('');
            setOpen(true);
          }}
        >
          Create sub-account
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create sub-account"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={create} disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-2 text-[14px] font-normal">
          Account name
          <input
            autoFocus
            className={INPUT_CLS}
            value={label}
            placeholder="Trading bot, Team vault…"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (!busy) create();
              }
            }}
          />
        </label>
        <Text variant="label.regular" tone="muted">
          A delegated account with its own address, controlled by this account. It deploys on first use.
        </Text>
      </Modal>
    </div>
  );
}
