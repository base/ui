'use client';

import { useEffect, useRef, useState } from 'react';
import type { Address, Hex } from '@aa';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { CloseIcon } from '../../../../components/ui/icons';
import { Spinner } from '../../../../components/ui/Spinner';
import { Select } from '../../../../components/ui/Select';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { AnimatedAmount } from '../../_components/AnimatedAmount';
import {
  DEMO_CHAINS,
  getDemoChain,
} from '../library/chains';
import {
  EXPIRY_PRESETS,
  formatEthWei,
  formatExpiry,
  formatUnits,
  scopeChips,
  type SignerKind,
  type StoredAccount,
} from '../library/model';
import {
  type LimitDraft,
  OWNER_SCOPE_PRESETS,
  PERIOD_PRESETS,
  periodLabel,
  type ScopeDraft,
  scopeLabel,
  SELECTOR_PRESETS,
  stableSymbol,
} from '../library/policy';
import { type Balances, KIND_LABEL, short, signerIdentity, type WalletSigner } from '../shared';
import { AccountAvatar, AccountIdentity, Badge, CheckIcon, KindBadge } from './primitives';

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const INPUT_CLS =
  'w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-black dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40';
const CHIP_CLS =
  'rounded-full border border-bds-gray-10 px-2.5 py-1 text-[12px] text-bds-gray-60 transition-colors hover:border-bds-gray-15 dark:border-white/10 dark:text-bds-gray-40';
const CHIP_ON = 'border-base-blue bg-bds-blue-0 text-base-blue dark:border-bds-blue-60 dark:bg-bds-blue-100/30 dark:text-bds-blue-20';

type CfgTab = 'assets' | 'owners' | 'session' | 'subaccounts';

type PolicyRemaining = Record<
  string,
  Record<string, { remaining: bigint; allowance: bigint; symbol: string; decimals: number; period: number }>
>;

export type ConfigViewProps = {
  acct: StoredAccount;
  copied: string | null;
  copy: (text: string, k: string) => void;
  cfgTab: CfgTab;
  setCfgTab: (t: CfgTab) => void;
  explorerHref: string;
  onTransact: () => void;

  // Assets
  assetBals: Record<string, Balances | null>;
  assetsLoading: boolean;
  faucetBusy: string | null;
  requestFaucet: () => void;

  // Owners
  signers: WalletSigner[];
  ownerDraft: string[];
  scopeDraft: Record<string, number>;
  ownersEditing: boolean;
  setOwnersEditing: (v: boolean) => void;
  pendingAuthorize: WalletSigner[];
  pendingRevoke: { signerId: string; label: string; kind: SignerKind }[];
  pendingScope: { signerId: string; label: string; toScope: number }[];
  keyChangeCount: number;
  ownerChangeSigned: boolean;
  configTx: { hash: Hex; label: string } | null;
  applying: boolean;
  busy: SignerKind | null;
  stageAddOwner: (id: string) => void;
  stageRemoveOwner: (id: string, eoaSelf: boolean) => void;
  setOwnerScope: (id: string, scope: number) => void;
  mintOwner: (kind: SignerKind) => void;
  signOwnerChange: () => void;
  applyOwnerNow: () => void;
  discardOwnerChanges: () => void;

  // Session keys
  sessionAdding: boolean;
  setSessionAdding: (v: boolean) => void;
  skSignerId: string;
  setSkSignerId: (v: string) => void;
  skChainShort: string;
  setSkChainShort: (v: string) => void;
  skExpiryId: string;
  setSkExpiryId: (v: string) => void;
  skLimits: LimitDraft[];
  patchLimit: (id: string, patch: Partial<LimitDraft>) => void;
  addLimit: () => void;
  removeLimit: (id: string) => void;
  skScopes: ScopeDraft[];
  patchScope: (id: string, patch: Partial<ScopeDraft>) => void;
  addScope: () => void;
  removeScope: (id: string) => void;
  toggleScopeSelector: (id: string, sel: Hex) => void;
  setScopeAll: (id: string) => void;
  skBusy: boolean;
  skApplyingId: string | null;
  skRevokingId: string | null;
  policyRemaining: PolicyRemaining;
  formPolicyEmpty: boolean;
  submitStatus: '' | 'submitting' | 'confirming';
  registerSessionKey: () => void;
  applySessionKeyNow: (skId: string) => void;
  revokeSessionKey: (id: string) => void;
  undoStagedRevoke: (id: string) => void;

  // Sub-accounts
  saLabel: string;
  setSaLabel: (v: string) => void;
  saBusy: boolean;
  createSubAccount: () => void;
};

// Config view for a selected account: hero + tabbed Assets / Owners / Session
// keys / Sub-accounts. The owner-change and session-key flows sign + broadcast
// through the parent's handlers.
export function ConfigView(p: ConfigViewProps) {
  const { acct } = p;
  const tabs: { id: CfgTab; label: string; count: number | null }[] = [
    { id: 'assets', label: 'Assets', count: null },
    { id: 'owners', label: 'Owners', count: acct.owners.length },
    { id: 'session', label: 'Session keys', count: acct.sessionKeys.length },
    { id: 'subaccounts', label: 'Sub-accounts', count: acct.subAccounts.length },
  ];
  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-wrap items-center gap-4">
        <AccountIdentity
          label={acct.label}
          address={acct.address}
          variant={acct.parentId ? 'spending' : 'default'}
          badges={<>
            {acct.type === 'eoa' ? <Badge>EOA</Badge> : null}
            {acct.deployed ? <Badge tone="ok">Deployed</Badge> : null}
          </>}
          onCopy={() => p.copy(acct.address, 'cfg')}
          copied={p.copied === 'cfg'}
          className="min-w-0 flex-1"
        />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={p.onTransact}>
            Transact
          </Button>
          <Button variant="outline" size="sm" href={p.explorerHref}>
            Explorer
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-bds-gray-10 dark:border-white/10">
        {tabs.map((t) => {
          const active = p.cfgTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => p.setCfgTab(t.id)}
              className={cn(
                'relative -mb-px px-3 py-2 text-[14px] transition-colors',
                active
                  ? 'text-black dark:text-white'
                  : 'text-bds-gray-60 hover:text-black dark:text-bds-gray-40 dark:hover:text-white',
              )}
            >
              {t.label}
              {t.count != null ? (
                <span className="ml-1.5 rounded-full bg-bds-gray-10 px-1.5 text-[11px] dark:bg-white/10">
                  {t.count}
                </span>
              ) : null}
              {active ? (
                <motion.div
                  layoutId="cfg-tab-underline"
                  className="absolute right-0 bottom-0 left-0 h-0.5 bg-black dark:bg-white"
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={p.cfgTab}
          initial={{ opacity: 0, transform: 'translateY(4px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1, ease: [0.23, 1, 0.32, 1] }}
        >
          {p.cfgTab === 'assets' ? <AssetsTab p={p} /> : null}
          {p.cfgTab === 'owners' ? <OwnersTab p={p} /> : null}
          {p.cfgTab === 'session' ? <SessionKeysTab p={p} /> : null}
          {p.cfgTab === 'subaccounts' ? <SubAccountsTab p={p} /> : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function AssetsTab({ p }: { p: ConfigViewProps }) {
  const [faucetDone, setFaucetDone] = useState(false);
  const prevBusy = useRef(p.faucetBusy);
  useEffect(() => {
    if (prevBusy.current && !p.faucetBusy) {
      setFaucetDone(true);
      const t = setTimeout(() => setFaucetDone(false), 700);
      return () => clearTimeout(t);
    }
    prevBusy.current = p.faucetBusy;
  }, [p.faucetBusy]);

  const cleanName = (s: string) => s.replace(/\s*devnet\s*$/i, '').trim();
  const rows = DEMO_CHAINS.map((c) => ({
    net: c.shortName,
    name: cleanName(c.name),
    faucet: c.shortName === 'vibenet',
  }));
  const assets: { key: string; symbol: string; fullName: string; balance: string; faucet: boolean }[] = [];
  for (const r of rows) {
    const b = p.assetBals[r.net];
    const stable = b?.usdv_symbol ?? (r.net === 'vibenet' ? 'USDV' : 'USDC');
    assets.push({
      key: `${r.net}-eth`,
      symbol: 'ETH',
      fullName: 'Ether',
      balance: p.assetsLoading ? '…' : formatEthWei(b?.eth_wei),
      faucet: r.faucet,
    });
    assets.push({
      key: `${r.net}-stable`,
      symbol: stable,
      fullName: stable === 'USDV' ? 'Vibenet USD' : 'USD Coin',
      balance: p.assetsLoading ? '…' : formatUnits(b?.usdv, b?.usdv_decimals),
      faucet: r.faucet,
    });
  }
  const hasFaucet = assets.some((a) => a.faucet);
  return (
    <div className="-mt-2 flex flex-col gap-3">
      <ul className="flex flex-col">
        {assets.map((a) => (
          <li key={a.key} className={cn('flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors duration-700', a.faucet && faucetDone && 'bg-bds-green-0 dark:bg-bds-green-100/20')}>
            <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full bg-bds-gray-10 dark:bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[14px] font-normal">{a.fullName}</span>
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{a.symbol}</span>
            </div>
            <span className="ml-auto font-base text-[14px]">
              <AnimatedAmount
                text={a.balance}
                decimals={a.symbol === 'ETH' ? 4 : 2}
                group={a.symbol !== 'ETH'}
              />
            </span>
          </li>
        ))}
      </ul>
      {hasFaucet ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={p.requestFaucet}
            disabled={p.faucetBusy !== null}
          >
            {p.faucetBusy ? <Spinner /> : 'Top Up'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function OwnersTab({ p }: { p: ConfigViewProps }) {
  const { acct } = p;
  const isEoaSelf = (signerId: string) =>
    acct.type === 'eoa' && signerId === acct.initialActors[0]?.signerId;
  const draftActors = acct.owners
    .filter((o) => p.ownerDraft.includes(o.signerId))
    .map((o) => ({ id: o.signerId, kind: o.kind, label: o.label, identity: o.identity, applied: o.scope ?? 0 }))
    .concat(
      p.pendingAuthorize.map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        identity: signerIdentity(s),
        applied: 0,
      })),
    );
  const addable = p.signers.filter((s) => !p.ownerDraft.includes(s.id));
  const showApply = p.ownersEditing || p.keyChangeCount > 0 || p.ownerChangeSigned;

  return (
    <section className="flex flex-col gap-4">
      {!p.ownersEditing ? (
        <>
          <div className="flex flex-col gap-3">
            {acct.owners.map((o) => (
              <div key={o.signerId} className="flex items-center gap-3 rounded-lg border border-bds-gray-10 p-3 dark:border-white/10">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-normal">{o.label}</span>
                    {isEoaSelf(o.signerId) ? <Badge>EOA</Badge> : null}
                  </div>
                  <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{short(o.identity)}</span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <KindBadge kind={o.kind} />
                  {(o.scope ?? 0) === 0 ? (
                    <span className={cn(CHIP_CLS, 'flex items-center gap-1')}>
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7V5a3 3 0 0 1 6 0v2" /><rect x="3" y="7" width="10" height="7" rx="1.5" /></svg>
                      Full Control
                    </span>
                  ) : (
                    scopeChips(o.scope ?? 0).map((c) => (
                      <span key={c} className={CHIP_CLS}>
                        {c}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => p.setOwnersEditing(true)}>
              Modify Owners
            </Button>
          </div>
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {draftActors.map((o) => {
              const isNew = p.pendingAuthorize.some((s) => s.id === o.id);
              const canRevoke = draftActors.length > 1;
              const eoaSelf = isEoaSelf(o.id);
              const curScope = p.scopeDraft[o.id] ?? o.applied;
              const curPreset = OWNER_SCOPE_PRESETS.find((pp) => pp.scope === curScope)?.id ?? 'full';
              const scopeChanged = curScope !== o.applied;
              return (
                <li
                  key={o.id}
                  className={cn(
                    'flex flex-wrap items-center gap-2 rounded-lg border p-3',
                    isNew
                      ? 'border-bds-blue-20 bg-bds-blue-0 dark:border-bds-blue-80 dark:bg-bds-blue-100/20'
                      : 'border-bds-gray-10 dark:border-white/10',
                  )}
                >
                  <KindBadge kind={o.kind} />
                  <span className="text-[13px] font-normal">{o.label}</span>
                  {eoaSelf ? <Badge>EOA</Badge> : null}
                  <span className="font-sans text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{short(o.identity)}</span>
                  <div className="ml-auto w-40">
                    <Select
                      ariaLabel="Permissions for this key"
                      value={curPreset}
                      onValueChange={(value) => {
                        const scope = OWNER_SCOPE_PRESETS.find((pp) => pp.id === value)?.scope ?? 0;
                        p.setOwnerScope(o.id, scope);
                      }}
                      options={OWNER_SCOPE_PRESETS.map((pp) => ({ value: pp.id, label: pp.label }))}
                    />
                  </div>
                  {isNew ? <Badge tone="ok">Authorize +</Badge> : scopeChanged ? <Badge>Scope ~</Badge> : null}
                  <button
                    type="button"
                    onClick={() => p.stageRemoveOwner(o.id, eoaSelf && !isNew)}
                    disabled={!canRevoke}
                    className="text-[12px] text-bds-red-60 transition-colors hover:text-bds-red-70 disabled:cursor-not-allowed disabled:opacity-40"
                    title={!canRevoke ? 'An account needs at least one owner' : 'Revoke this key'}
                  >
                    {isNew ? 'undo' : 'Revoke'}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Add an owner</span>
            <div className="flex flex-wrap gap-2">
              {addable.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => p.stageAddOwner(s.id)}
                  className={CHIP_CLS}
                >
                  + {s.label} ({KIND_LABEL[s.kind]})
                </button>
              ))}
              <button type="button" onClick={() => p.mintOwner('k1')} disabled={p.busy !== null} className={CHIP_CLS}>
                {p.busy === 'k1' ? '…' : '+ New K1 key'}
              </button>
              <button type="button" onClick={() => p.mintOwner('passkey')} disabled={p.busy !== null} className={CHIP_CLS}>
                {p.busy === 'passkey' ? '…' : '+ New passkey'}
              </button>
            </div>
          </div>
        </>
      )}

      {showApply ? (
        <div
          className={cn(
            'flex flex-col gap-3 rounded-lg border p-4',
            p.keyChangeCount > 0 || p.ownerChangeSigned
              ? 'border-bds-blue-20 bg-bds-blue-0 dark:border-bds-blue-80 dark:bg-bds-blue-100/20'
              : 'border-bds-gray-10 dark:border-white/10',
          )}
        >
          {p.keyChangeCount === 0 && !p.ownerChangeSigned ? (
            <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
              No staged changes. Add a key above, or revoke one — then sign to apply.
            </span>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {p.pendingAuthorize.map((s) => (
                  <Badge key={`a-${s.id}`} tone="ok">
                    + {s.label}
                  </Badge>
                ))}
                {p.pendingRevoke.map((o) => (
                  <Badge key={`r-${o.signerId}`} tone="error">
                    − {o.label}
                  </Badge>
                ))}
                {p.pendingScope.map((o) => (
                  <Badge key={`s-${o.signerId}`}>
                    {o.label} → {scopeLabel(o.toScope)}
                  </Badge>
                ))}
              </div>
              {p.ownerChangeSigned ? (
                <>
                  <p className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
                    <span className="inline-flex items-center gap-1 text-bds-green-70 dark:text-bds-green-20">Signed</span> — owner change authorized.
                    It rides your next Transact automatically, or apply it now.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={p.applyOwnerNow} disabled={p.applying}>
                      {p.submitStatus === 'submitting'
                        ? 'Submitting…'
                        : p.submitStatus === 'confirming'
                          ? 'Waiting…'
                          : p.applying
                            ? 'Applying…'
                            : 'Apply Now'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={p.discardOwnerChanges}>
                      Discard
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
                    Sign the owner change first — a current owner authorizes it. The signed change then rides your
                    next Transact, or you can apply it immediately.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={p.signOwnerChange} disabled={p.applying}>
                      {p.applying ? 'Signing…' : 'Sign Owner Change'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={p.discardOwnerChanges}>
                      Discard Changes
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
          {p.configTx && TX_HASH_RE.test(p.configTx.hash) ? (
            <Link
              href={`${VIBENET_EXPLORER_PATH}/tx/${p.configTx.hash}`}
              className="flex items-center gap-2 font-sans text-[12px] text-base-blue hover:underline dark:text-bds-blue-20"
            >
              <Badge tone="ok">{p.configTx.label} landed</Badge>
              <code>{short(p.configTx.hash, 14, 12)}</code>
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SessionKeysTab({ p }: { p: ConfigViewProps }) {
  const { acct } = p;
  return (
    <section className="flex flex-col gap-4">
      <Text variant="label" tone="muted" className="font-normal">
        Authorize a scoped, expiring, policy-gated key — for an agent, a dapp, or a hot signer.
      </Text>
      {acct.sessionKeys.length === 0 ? null : (
        <div className="flex flex-col gap-3">
          {acct.sessionKeys.map((sk) => {
            const live = Object.entries(p.policyRemaining[sk.id] ?? {});
            return (
              <div key={sk.id} className="flex flex-col gap-2 rounded-lg border border-bds-gray-10 p-4 dark:border-white/10">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-normal">{sk.label}</span>
                      <KindBadge kind={sk.kind} />
                    </div>
                    <span className="font-sans text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{short(sk.actorId)}</span>
                  </div>
                  {!sk.pendingAuth && !sk.pendingRevoke ? (
                    <button
                      type="button"
                      onClick={() => p.revokeSessionKey(sk.id)}
                      disabled={p.skRevokingId === sk.id}
                      className="shrink-0 text-[12px] text-bds-red-60 hover:text-bds-red-70 disabled:opacity-50"
                    >
                      {p.skRevokingId === sk.id ? 'Signing…' : 'Revoke'}
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {scopeChips(sk.scope).map((c) => (
                    <Badge key={c}>{c}</Badge>
                  ))}
                  <Badge>{formatExpiry(sk.expiry)}</Badge>
                </div>
                {sk.policy ? (
                  <div className="flex flex-col gap-1">
                    {live.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {live.map(([token, b]) => (
                          <div key={token} className="flex items-center justify-between text-[13px]">
                            <span className="text-bds-gray-50 dark:text-bds-gray-40">{sk.policy!.label}</span>
                            <span className="font-normal text-black dark:text-white">
                              {formatUnits(b.remaining, b.decimals)} / {formatUnits(b.allowance, b.decimals)} {b.symbol}{b.period ? ` ${periodLabel(b.period)}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : sk.policy.limits && sk.policy.limits.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {sk.policy.limits.map((lim) => (
                          <div key={lim.token} className="flex items-center justify-between text-[13px]">
                            <span className="text-bds-gray-50 dark:text-bds-gray-40">{sk.policy!.label}</span>
                            <span className="font-normal text-black dark:text-white">
                              ≤ {formatUnits(lim.allowance, lim.decimals)} {lim.symbol}{lim.period ? ` ${periodLabel(lim.period)}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-bds-gray-50 dark:text-bds-gray-40">{sk.policy.label}</span>
                        <span className="font-normal text-black dark:text-white">{sk.policy.params}</span>
                      </div>
                    )}
                  </div>
                ) : null}
                {sk.pendingAuth ? (
                  <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-2 dark:border-white/10">
                    <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      <span className="inline-flex items-center gap-1 text-bds-green-70 dark:text-bds-green-20">Signed</span> — installs on this key&apos;s
                      first transaction, or apply it now.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => p.applySessionKeyNow(sk.id)} disabled={p.skApplyingId === sk.id}>
                        {p.skApplyingId === sk.id
                          ? p.submitStatus === 'submitting'
                            ? 'Submitting…'
                            : p.submitStatus === 'confirming'
                              ? 'Waiting…'
                              : 'Applying…'
                          : 'Apply Now'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => p.revokeSessionKey(sk.id)}>
                        Discard
                      </Button>
                    </div>
                  </div>
                ) : null}
                {sk.pendingRevoke ? (
                  <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-2 dark:border-white/10">
                    <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      <span className="text-bds-red-60 dark:text-bds-red-40">Revoke signed</span> — applies on this account&apos;s
                      next session-key transaction, or apply it now. The policy manager is kept.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => p.applySessionKeyNow(sk.id)} disabled={p.skApplyingId === sk.id}>
                        {p.skApplyingId === sk.id
                          ? p.submitStatus === 'submitting'
                            ? 'Submitting…'
                            : p.submitStatus === 'confirming'
                              ? 'Waiting…'
                              : 'Applying…'
                          : 'Apply Now'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => p.undoStagedRevoke(sk.id)}>
                        Undo
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {p.sessionAdding ? <SessionForm p={p} /> : null}

      <div>
        <Button variant="secondary" size="sm" onClick={() => {
          if (!p.sessionAdding) {
            const avail = p.signers.find((s) =>
              !acct.owners.some((o) => o.actorId === s.actorId) &&
              !acct.sessionKeys.some((sk) => sk.actorId === s.actorId)
            );
            if (avail) p.setSkSignerId(avail.id);
          }
          p.setSessionAdding(!p.sessionAdding);
        }}>
          {p.sessionAdding ? 'Cancel' : 'Add Session Key'}
        </Button>
      </div>
    </section>
  );
}

function SessionForm({ p }: { p: ConfigViewProps }) {
  const { acct } = p;
  const impliedScopes: { key: string; label: string; note: string }[] = [];
  for (const l of p.skLimits) {
    if (l.token === 'stable')
      impliedScopes.push({
        key: `implied-stable-${l.id}`,
        label: `${stableSymbol(p.skChainShort)} contract`,
        note: 'transfer · auto-pinned by spend limit',
      });
    else if (l.token === 'custom' && ADDR_RE.test(l.custom.trim()))
      impliedScopes.push({
        key: `implied-custom-${l.id}`,
        label: short(l.custom.trim()),
        note: 'transfer · auto-pinned by spend limit',
      });
  }
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-bds-gray-10 bg-bds-gray-5 p-4 dark:border-white/10 dark:bg-white/5">
      <Text variant="label" className="font-normal">
        Register a Session Key
      </Text>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          Signer
          <Select
            value={p.skSignerId}
            onValueChange={p.setSkSignerId}
            placeholder="Select"
            options={p.signers.map((s) => {
              const isOwner = acct.owners.some((o) => o.actorId === s.actorId);
              const isSession = acct.sessionKeys.some((sk) => sk.actorId === s.actorId);
              return {
                value: s.id,
                disabled: isOwner || isSession,
                label: `${s.label}${isOwner ? ' — owner' : isSession ? ' — session key' : ''}`,
              };
            })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          Chain
          <Select
            value={p.skChainShort}
            onValueChange={p.setSkChainShort}
            options={DEMO_CHAINS.map((c) => ({ value: c.shortName, label: c.name }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          Expiry
          <Select
            value={p.skExpiryId}
            onValueChange={p.setSkExpiryId}
            options={EXPIRY_PRESETS.map((e) => ({ value: e.id, label: e.label }))}
          />
        </label>
      </div>

      {/* Spend Limits */}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-normal">Spend Limits</span>
        {p.skLimits.length === 0 ? (
          <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">No spend cap on this key.</span>
        ) : null}
        {p.skLimits.map((l) => {
          const customOk = l.token !== 'custom' || ADDR_RE.test(l.custom.trim());
          return (
            <div key={l.id} className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={l.token}
                  onValueChange={(value) => p.patchLimit(l.id, { token: value as LimitDraft['token'] })}
                  options={[
                    { value: 'stable', label: stableSymbol(p.skChainShort) },
                    { value: 'eth', label: 'ETH' },
                    { value: 'custom', label: 'Custom token...' },
                  ]}
                />
              </div>
              {l.token === 'custom' ? (
                <input
                  className={cn(INPUT_CLS, 'flex-1', !customOk && 'border-bds-red-40')}
                  value={l.custom}
                  spellCheck={false}
                  placeholder="0x token address (18 dec)"
                  onChange={(e) => p.patchLimit(l.id, { custom: e.target.value })}
                />
              ) : null}
              <input
                className={cn(INPUT_CLS, 'flex-1')}
                value={l.amount}
                inputMode="decimal"
                placeholder={l.token === 'eth' ? '0.1' : '100'}
                onChange={(e) => p.patchLimit(l.id, { amount: e.target.value })}
              />
              <div className="flex-1">
                <Select
                  value={l.periodId}
                  onValueChange={(value) => p.patchLimit(l.id, { periodId: value })}
                  options={PERIOD_PRESETS.map((pp) => ({ value: pp.id, label: pp.label }))}
                />
              </div>
              <button
                type="button"
                onClick={() => p.removeLimit(l.id)}
                aria-label="Remove limit"
                className="shrink-0 text-bds-gray-50 hover:text-bds-red-60"
              >
                <CloseIcon size={10} />
              </button>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" size="sm" onClick={p.addLimit}>
            + Add Limit
          </Button>
        </div>
      </div>

      {/* Target allowlist */}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-normal">Target Allowlist</span>
        {impliedScopes.map((imp) => (
          <div
            key={imp.key}
            className="flex items-center justify-between gap-2 rounded-md border border-bds-gray-10 bg-white px-3 py-2 text-[12px] dark:border-white/10 dark:bg-white/5"
          >
            <span className="font-normal">{imp.label}</span>
            <span className="text-bds-gray-60 dark:text-bds-gray-40">{imp.note}</span>
          </div>
        ))}
        {p.skScopes.length === 0 && impliedScopes.length === 0 ? (
          <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
            No target restriction — key may call anything the limits allow.
          </span>
        ) : null}
        {p.skScopes.map((s) => {
          const addrOk = !s.target.trim() || ADDR_RE.test(s.target.trim());
          return (
            <div key={s.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  className={cn(INPUT_CLS, 'flex-1', !addrOk && 'border-bds-red-40')}
                  value={s.target}
                  spellCheck={false}
                  placeholder="0x target contract"
                  onChange={(e) => p.patchScope(s.id, { target: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => p.removeScope(s.id)}
                  aria-label="Remove target"
                  className="shrink-0 text-bds-gray-50 hover:text-bds-red-60"
                >
                  <CloseIcon size={10} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => p.setScopeAll(s.id)}
                  className={cn(CHIP_CLS, s.all && CHIP_ON)}
                >
                  All Selectors
                </button>
                {SELECTOR_PRESETS.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => p.toggleScopeSelector(s.id, sp.selector)}
                    title={sp.selector}
                    className={cn(CHIP_CLS, s.selectors.includes(sp.selector) && CHIP_ON)}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" size="sm" onClick={p.addScope}>
            + Add Target
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p className="flex-1 text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          Send-only key on {getDemoChain(p.skChainShort).name}.
          {p.skLimits.some((l) => l.token === 'eth')
            ? ' An ETH limit needs at least one allowed target to pay.'
            : ''}
        </p>
        <Button size="sm" variant="secondary" onClick={() => p.setSessionAdding(false)} disabled={p.skBusy}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={p.registerSessionKey}
          disabled={p.skBusy || !p.skSignerId || p.formPolicyEmpty}
        >
          {p.skBusy ? 'Signing Authorization…' : 'Sign Authorization'}
        </Button>
      </div>
    </div>
  );
}

function SubAccountsTab({ p }: { p: ConfigViewProps }) {
  const { acct } = p;
  const [creating, setCreating] = useState(false);
  return (
    <section className="flex flex-col gap-4">
      <Text variant="label" tone="muted" className="font-normal">
        Spin up a delegated account with its own address, controlled by this one.
      </Text>
      {acct.subAccounts.length > 0 ? (
        <div className="flex flex-col gap-3">
          {acct.subAccounts.map((sa) => (
            <div key={sa.id} className="flex items-center gap-3 rounded-lg border border-bds-gray-10 p-3 dark:border-white/10">
              <AccountIdentity label={sa.label} address={sa.address} variant="spending" className="min-w-0 flex-1" />
              <Badge>delegate → {short(sa.delegateTo, 6, 4)}</Badge>
            </div>
          ))}
        </div>
      ) : null}

      {creating ? (
        <div className="flex flex-col gap-3 rounded-lg border border-bds-gray-10 bg-bds-gray-5 p-4 dark:border-white/10 dark:bg-white/5">
          <Text variant="label" className="font-normal">
            Create a Sub-Account
          </Text>
          <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
            A delegated account with its own address, controlled by this account via{' '}
            <code>key.delegate(parent)</code>.
          </p>
          <input
            autoFocus
            className={INPUT_CLS}
            value={p.saLabel}
            placeholder={'name, e.g. "Trading bot" or "Team vault"'}
            onChange={(e) => p.setSaLabel(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setCreating(false)} disabled={p.saBusy}>
              Cancel
            </Button>
            <Button size="sm" onClick={p.createSubAccount} disabled={p.saBusy}>
              {p.saBusy ? 'Deriving…' : 'Create Sub-Account'}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            Create Sub-Account
          </Button>
        </div>
      )}
    </section>
  );
}
