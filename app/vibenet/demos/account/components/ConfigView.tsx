'use client';

import type { Address, Hex } from '@aa';
import Link from 'next/link';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Select } from '../../../../components/ui/Select';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { AnimatedAmount } from '../../_components/AnimatedAmount';
import { Stat } from '../../_components/Stat';
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
import { AccountDot, Badge, KindBadge } from './primitives';

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const INPUT_CLS =
  'w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-bds-blue-60 dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40';
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
    <Card className="flex flex-col gap-6 bg-white p-6 dark:bg-white/5">
      {/* Hero */}
      <div className="flex flex-wrap items-center gap-4">
        <AccountDot size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[16px] font-medium">{acct.label}</span>
          <button
            type="button"
            onClick={() => p.copy(acct.address, 'cfg')}
            title="Copy address"
            className="flex w-fit items-center gap-2 text-left"
          >
            <code className="truncate font-mono text-[13px] text-base-blue dark:text-bds-blue-20">
              {acct.address}
            </code>
            <span className="text-[11px] uppercase tracking-[0.4px] text-bds-gray-50">
              {p.copied === 'cfg' ? 'Copied' : 'copy'}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-5">
          <Stat n={acct.owners.length} label="owners" />
          <Stat n={acct.sessionKeys.length} label="sessions" />
          <Stat n={acct.subAccounts.length} label="sub-accts" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {acct.type === 'eoa' ? <Badge>EOA</Badge> : null}
        {acct.deployed ? <Badge tone="ok">deployed</Badge> : null}
        <Button variant="outline" size="sm" onClick={p.onTransact} className="ml-auto">
          Transact →
        </Button>
        <Link href={p.explorerHref} className="text-[13px] text-base-blue hover:underline dark:text-bds-blue-20">
          Explorer ↗
        </Link>
      </div>

      {/* Tab bar */}
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-bds-gray-10 dark:border-white/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={p.cfgTab === t.id}
            onClick={() => p.setCfgTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[14px] transition-colors',
              p.cfgTab === t.id
                ? 'border-base-blue text-black dark:border-bds-blue-40 dark:text-white'
                : 'border-transparent text-bds-gray-60 hover:text-black dark:text-bds-gray-40 dark:hover:text-white',
            )}
          >
            {t.label}
            {t.count ? (
              <span className="ml-1.5 rounded-full bg-bds-gray-10 px-1.5 text-[11px] dark:bg-white/10">
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {p.cfgTab === 'assets' ? <AssetsTab p={p} /> : null}
      {p.cfgTab === 'owners' ? <OwnersTab p={p} /> : null}
      {p.cfgTab === 'session' ? <SessionKeysTab p={p} /> : null}
      {p.cfgTab === 'subaccounts' ? <SubAccountsTab p={p} /> : null}
    </Card>
  );
}

function AssetsTab({ p }: { p: ConfigViewProps }) {
  const cleanName = (s: string) => s.replace(/\s*devnet\s*$/i, '').trim();
  // One row per supported chain. Sourced from DEMO_CHAINS so scoping the demo to
  // a single network (currently vibenet) can't leave a stale hardcoded row that
  // falls back to VIBENET and renders as a duplicate.
  const rows = DEMO_CHAINS.map((c) => ({
    net: c.shortName,
    name: cleanName(c.name),
    faucet: c.shortName === 'vibenet',
  }));
  return (
    <ul className="flex flex-col divide-y divide-bds-gray-10 dark:divide-white/10">
      {rows.map((r) => {
        const b = p.assetBals[r.net];
        const stable = b?.usdv_symbol ?? (r.net === 'vibenet' ? 'USDV' : 'USDC');
        return (
          <li key={r.net} className="flex flex-wrap items-center gap-4 py-4">
            <span className="flex items-center gap-2 text-[14px] font-medium">
              <AccountDot size="sm" />
              {r.name}
            </span>
            <span className="ml-auto flex items-center gap-6">
              <span className="text-[14px]">
                <AnimatedAmount text={p.assetsLoading ? '…' : formatEthWei(b?.eth_wei)} decimals={4} group={false} />{' '}
                <small className="text-bds-gray-60 dark:text-bds-gray-40">ETH</small>
              </span>
              <span className="text-[14px]">
                <AnimatedAmount
                  text={p.assetsLoading ? '…' : formatUnits(b?.usdv, b?.usdv_decimals)}
                  decimals={2}
                  group
                />{' '}
                <small className="text-bds-gray-60 dark:text-bds-gray-40">{stable}</small>
              </span>
            </span>
            {r.faucet ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={p.requestFaucet}
                disabled={p.faucetBusy !== null}
                title="Get testnet ETH + USDV from the vibenet faucet"
              >
                {p.faucetBusy ? 'Topping up…' : 'Top Up'}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
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
      <div className="flex items-center justify-between">
        <Text variant="label" className="font-medium">
          Owners
        </Text>
        <Button variant="outline" size="sm" onClick={() => p.setOwnersEditing(!p.ownersEditing)}>
          {p.ownersEditing ? 'Done' : 'Modify owners'}
        </Button>
      </div>

      {!p.ownersEditing ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {acct.owners.map((o) => (
            <div key={o.signerId} className="flex flex-col gap-2 rounded-lg border border-bds-gray-10 p-4 dark:border-white/10">
              <div className="flex items-center gap-2">
                <KindBadge kind={o.kind} />
                <span className="truncate text-[14px] font-medium">{o.label}</span>
                {isEoaSelf(o.signerId) ? <Badge>EOA</Badge> : null}
              </div>
              <code className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{short(o.identity)}</code>
              <div className="flex flex-wrap gap-1.5">
                {(o.scope ?? 0) === 0 ? (
                  <span className={cn(CHIP_CLS, CHIP_ON)}>full control</span>
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
                  <span className="text-[13px] font-medium">{o.label}</span>
                  {eoaSelf ? <Badge>EOA</Badge> : null}
                  <code className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{short(o.identity)}</code>
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
                  {isNew ? <Badge tone="ok">authorize +</Badge> : scopeChanged ? <Badge>scope ~</Badge> : null}
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
                  <span
                    key={`r-${o.signerId}`}
                    className="inline-flex items-center rounded-full border border-bds-red-20 bg-bds-red-0 px-2 py-1 text-[11px] font-medium uppercase leading-none tracking-[0px] text-bds-red-70 dark:border-bds-red-80 dark:bg-bds-red-100/40 dark:text-bds-red-20"
                  >
                    − {o.label}
                  </span>
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
                    <b className="text-bds-green-70 dark:text-bds-green-20">✓ Signed</b> — owner change authorized.
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
                            : 'Apply now'}
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
                      {p.applying ? 'Signing…' : 'Sign owner change'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={p.discardOwnerChanges}>
                      Discard changes
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
          {p.configTx && TX_HASH_RE.test(p.configTx.hash) ? (
            <Link
              href={`${VIBENET_EXPLORER_PATH}/tx/${p.configTx.hash}`}
              className="flex items-center gap-2 font-mono text-[12px] text-base-blue hover:underline dark:text-bds-blue-20"
            >
              <Badge tone="ok">✓ {p.configTx.label} landed</Badge>
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
      <div className="flex items-center justify-between">
        <Text variant="label" className="font-medium">
          Session keys
        </Text>
        <Button variant="outline" size="sm" onClick={() => p.setSessionAdding(!p.sessionAdding)}>
          {p.sessionAdding ? 'Cancel' : '+ Add session key'}
        </Button>
      </div>

      {acct.sessionKeys.length === 0 ? (
        <Text variant="footnote" tone="muted" className="py-2">
          No session keys yet. Authorize a scoped, expiring, policy-gated key — for an agent, a dapp, or a hot
          signer.
        </Text>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {acct.sessionKeys.map((sk) => {
            const live = Object.entries(p.policyRemaining[sk.id] ?? {});
            return (
              <div key={sk.id} className="flex flex-col gap-2 rounded-lg border border-bds-gray-10 p-4 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <KindBadge kind={sk.kind} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{sk.label}</span>
                  {!sk.pendingAuth && !sk.pendingRevoke ? (
                    <button
                      type="button"
                      onClick={() => p.revokeSessionKey(sk.id)}
                      disabled={p.skRevokingId === sk.id}
                      className="text-[12px] text-bds-red-60 hover:text-bds-red-70 disabled:opacity-50"
                    >
                      {p.skRevokingId === sk.id ? 'signing…' : 'revoke'}
                    </button>
                  ) : null}
                </div>
                <code className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{short(sk.actorId)}</code>
                <div className="flex flex-wrap gap-1.5">
                  {scopeChips(sk.scope).map((c) => (
                    <span key={c} className={CHIP_CLS}>
                      {c}
                    </span>
                  ))}
                  <span className={CHIP_CLS}>{formatExpiry(sk.expiry)}</span>
                </div>
                {sk.policy ? (
                  <div className="flex flex-col gap-1 rounded-md border border-bds-gray-10 bg-bds-gray-0 p-2 dark:border-white/10 dark:bg-white/5">
                    <span className="text-[12px] font-medium text-bds-purple-70 dark:text-bds-purple-20">
                      ◆ {sk.policy.label}
                    </span>
                    {live.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {live.map(([token, b]) => (
                          <span key={token} className={CHIP_CLS}>
                            {formatUnits(b.remaining, b.decimals)} / {formatUnits(b.allowance, b.decimals)} {b.symbol}{' '}
                            left{b.period ? ` ${periodLabel(b.period)}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : sk.policy.limits && sk.policy.limits.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {sk.policy.limits.map((lim) => (
                          <span key={lim.token} className={CHIP_CLS}>
                            ≤ {formatUnits(lim.allowance, lim.decimals)} {lim.symbol}
                            {lim.period ? ` ${periodLabel(lim.period)}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{sk.policy.params}</span>
                    )}
                  </div>
                ) : null}
                {sk.pendingAuth ? (
                  <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-2 dark:border-white/10">
                    <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      <b className="text-bds-green-70 dark:text-bds-green-20">✓ Signed</b> — installs on this key&apos;s
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
                          : 'Apply now'}
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
                      <b className="text-bds-red-60 dark:text-bds-red-40">Revoke signed</b> — applies on this account&apos;s
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
                          : 'Apply now'}
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
    <div className="flex flex-col gap-4 rounded-lg border border-bds-gray-10 p-4 dark:border-white/10">
      <Text variant="label" className="font-medium">
        Register a session key
      </Text>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          Signer
          <Select
            value={p.skSignerId}
            onValueChange={p.setSkSignerId}
            placeholder="Select a signer…"
            options={p.signers.map((s) => {
              const isOwner = acct.owners.some((o) => o.actorId === s.actorId);
              const isSession = acct.sessionKeys.some((sk) => sk.actorId === s.actorId);
              return {
                value: s.id,
                disabled: isOwner || isSession,
                label: `${s.label} (${KIND_LABEL[s.kind]})${isOwner ? ' — owner' : isSession ? ' — active session key' : ''}`,
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

      {/* Spend limits */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium">Spend limits</span>
          <button type="button" onClick={p.addLimit} className={CHIP_CLS}>
            + Add limit
          </button>
        </div>
        {p.skLimits.length === 0 ? (
          <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">No spend cap on this key.</span>
        ) : null}
        {p.skLimits.map((l) => {
          const customOk = l.token !== 'custom' || ADDR_RE.test(l.custom.trim());
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-2">
              <div className="w-32">
                <Select
                  value={l.token}
                  onValueChange={(value) => p.patchLimit(l.id, { token: value as LimitDraft['token'] })}
                  options={[
                    { value: 'stable', label: stableSymbol(p.skChainShort) },
                    { value: 'eth', label: 'ETH' },
                    { value: 'custom', label: 'Custom token…' },
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
                className={cn(INPUT_CLS, 'w-24')}
                value={l.amount}
                inputMode="decimal"
                placeholder={l.token === 'eth' ? '0.1' : '100'}
                onChange={(e) => p.patchLimit(l.id, { amount: e.target.value })}
              />
              <div className="w-28">
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
                className="text-[18px] text-bds-gray-50 hover:text-bds-red-60"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Target allowlist */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium">Target allowlist</span>
          <button type="button" onClick={p.addScope} className={CHIP_CLS}>
            + Add target
          </button>
        </div>
        {impliedScopes.map((imp) => (
          <div
            key={imp.key}
            className="flex items-center justify-between gap-2 rounded-md border border-dashed border-bds-gray-15 px-3 py-2 text-[12px] dark:border-white/15"
          >
            <span className="font-medium">{imp.label}</span>
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
                  className="text-[18px] text-bds-gray-50 hover:text-bds-red-60"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => p.setScopeAll(s.id)}
                  className={cn(CHIP_CLS, s.all && CHIP_ON)}
                >
                  All selectors
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
      </div>

      <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
        Send-only key on {getDemoChain(p.skChainShort).name}.
        {p.skLimits.some((l) => l.token === 'eth')
          ? ' An ETH limit needs at least one allowed target to pay.'
          : ''}
      </p>
      <Button
        onClick={p.registerSessionKey}
        disabled={p.skBusy || !p.skSignerId || p.formPolicyEmpty}
        className="w-fit"
      >
        {p.skBusy ? 'Signing authorization…' : 'Sign authorization'}
      </Button>
    </div>
  );
}

function SubAccountsTab({ p }: { p: ConfigViewProps }) {
  const { acct } = p;
  return (
    <section className="flex flex-col gap-4">
      {acct.subAccounts.length === 0 ? (
        <Text variant="footnote" tone="muted" className="py-2">
          No sub-accounts yet. Spin up a delegated account (its own address, controlled by this one).
        </Text>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {acct.subAccounts.map((sa) => (
            <div key={sa.id} className="flex flex-col gap-2 rounded-lg border border-bds-gray-10 p-4 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Badge>sub</Badge>
                <span className="truncate text-[14px] font-medium">{sa.label}</span>
              </div>
              <code className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{short(sa.address)}</code>
              <span className={CHIP_CLS + ' w-fit'}>delegate → {short(sa.delegateTo, 6, 4)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-bds-gray-10 p-4 dark:border-white/10">
        <Text variant="label" className="font-medium">
          Create a sub-account
        </Text>
        <input
          className={INPUT_CLS}
          value={p.saLabel}
          placeholder="name, e.g. “Trading bot” or “Team vault”"
          onChange={(e) => p.setSaLabel(e.target.value)}
        />
        <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          A delegated account with its own address, controlled by this account via{' '}
          <code>key.delegate(parent)</code>.
        </p>
        <Button onClick={p.createSubAccount} disabled={p.saBusy} className="w-fit">
          {p.saBusy ? 'Deriving…' : 'Create sub-account'}
        </Button>
      </div>
    </section>
  );
}
