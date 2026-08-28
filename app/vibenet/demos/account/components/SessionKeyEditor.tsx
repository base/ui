'use client';

// The "register a session key" form: signer + chain + expiry, spend limits, and
// a target allowlist. Owns its own draft state and turns it into an owner-signed
// authorization via the engine's `doAuthorizeSession` primitive. Extracted from
// ConfigView so both the account page and any future surface reuse it.

import type { Address } from '@aa';
import { useState } from 'react';

import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../components/ui/cn';
import { CloseIcon } from '../../../../components/ui/icons';
import { Select } from '../../../../components/ui/Select';
import { Text } from '../../../../components/ui/Text';
import { getDemoChain, DEMO_CHAINS } from '../library/chains';
import { EXPIRY_PRESETS } from '../library/model';
import {
  type LimitDraft,
  newLimitDraft,
  newScopeDraft,
  PERIOD_PRESETS,
  type PolicySpec,
  type ScopeDraft,
  SELECTOR_PRESETS,
  stableSymbol,
} from '../library/policy';
import { short } from '../shared';
import { useAccountEngine } from '../useAccountEngine';

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const INPUT_CLS =
  'w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40';
const CHIP_CLS =
  'rounded-full border border-bds-gray-10 px-2.5 py-1 text-[12px] text-bds-gray-60 transition-colors hover:border-bds-gray-15 dark:border-white/10 dark:text-bds-gray-40';
const CHIP_ON = 'border-base-blue bg-bds-blue-0 text-base-blue';

export function SessionKeyEditor({ onClose }: { onClose?: () => void }) {
  const { acct, signers, activeSigner, networkShort, doAuthorizeSession, setError } = useAccountEngine();

  const [skSignerId, setSkSignerId] = useState('');
  const [skExpiryId, setSkExpiryId] = useState('7d');
  const [skChainShort, setSkChainShort] = useState(networkShort);
  const [skLimits, setSkLimits] = useState<LimitDraft[]>(() => [newLimitDraft()]);
  const [skScopes, setSkScopes] = useState<ScopeDraft[]>([]);
  const [skBusy, setSkBusy] = useState(false);

  if (!acct) return null;

  const patchLimit = (id: string, patch: Partial<LimitDraft>) =>
    setSkLimits((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLimit = () => setSkLimits((ls) => [...ls, newLimitDraft()]);
  const removeLimit = (id: string) => setSkLimits((ls) => ls.filter((l) => l.id !== id));
  const patchScope = (id: string, patch: Partial<ScopeDraft>) =>
    setSkScopes((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addScope = () => setSkScopes((ss) => [...ss, newScopeDraft()]);
  const removeScope = (id: string) => setSkScopes((ss) => ss.filter((s) => s.id !== id));
  const toggleScopeSelector = (id: string, sel: `0x${string}`) =>
    setSkScopes((ss) =>
      ss.map((s) => {
        if (s.id !== id) return s;
        const selectors = s.selectors.includes(sel) ? s.selectors.filter((x) => x !== sel) : [...s.selectors, sel];
        return { ...s, selectors, all: selectors.length === 0 };
      }),
    );
  const setScopeAll = (id: string) =>
    setSkScopes((ss) => ss.map((s) => (s.id === id ? { ...s, all: true, selectors: [] } : s)));

  const formPolicySpec = (): PolicySpec => ({
    limits: skLimits.map((l) => ({
      token: l.token === 'custom' ? (l.custom.trim() as Address) : l.token,
      amount: l.amount,
      periodSecs: PERIOD_PRESETS.find((p) => p.id === l.periodId)?.seconds ?? 0,
    })),
    scopes: skScopes
      .filter((s) => s.target.trim())
      .map((s) => ({ target: s.target, selectors: s.all ? undefined : s.selectors })),
  });
  const formPolicyLabel = (): string => {
    const parts: string[] = [];
    if (skLimits.length) parts.push('Spend limit');
    if (skScopes.some((s) => s.target.trim())) parts.push('Allowlist');
    return parts.join(' + ') || 'Policy';
  };
  const formPolicyEmpty = skLimits.length === 0 && !skScopes.some((s) => s.target.trim());

  const registerSessionKey = async () => {
    if (!activeSigner) return;
    const target = signers.find((s) => s.id === skSignerId);
    if (!target) {
      setError('Pick a signer to authorize as a session key.');
      return;
    }
    if (acct.owners.some((o) => o.actorId === target.actorId)) {
      setError(`${target.label} is already an owner of this account — pick a different signer.`);
      return;
    }
    if (acct.sessionKeys.some((sk) => sk.actorId === target.actorId)) {
      setError(`${target.label} is already an active session key — revoke it first to change its policy.`);
      return;
    }
    if (formPolicyEmpty) {
      setError('Add a spend limit or at least one allowed target.');
      return;
    }
    setSkBusy(true);
    setError('');
    try {
      await doAuthorizeSession(target, {
        expirySecs: EXPIRY_PRESETS.find((p) => p.id === skExpiryId)!.seconds,
        policyLabel: formPolicyLabel(),
        spec: formPolicySpec(),
        label: target.label,
        chainShort: skChainShort,
      });
      setSkSignerId('');
      onClose?.();
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      setSkBusy(false);
    }
  };

  const impliedScopes: { key: string; label: string; note: string }[] = [];
  for (const l of skLimits) {
    if (l.token === 'stable')
      impliedScopes.push({
        key: `implied-stable-${l.id}`,
        label: `${stableSymbol(skChainShort)} contract`,
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
    <div className="flex flex-col gap-4">
      <Text variant="label" className="font-normal">
        Register a Session Key
      </Text>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          Signer
          <Select
            value={skSignerId}
            onValueChange={setSkSignerId}
            placeholder="Select"
            options={signers.map((s) => {
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
            value={skChainShort}
            onValueChange={setSkChainShort}
            options={DEMO_CHAINS.map((c) => ({ value: c.shortName, label: c.name }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          Expiry
          <Select
            value={skExpiryId}
            onValueChange={setSkExpiryId}
            options={EXPIRY_PRESETS.map((e) => ({ value: e.id, label: e.label }))}
          />
        </label>
      </div>

      {/* Spend Limits */}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-normal">Spend Limits</span>
        {skLimits.length === 0 ? (
          <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">No spend cap on this key.</span>
        ) : null}
        {skLimits.map((l) => {
          const customOk = l.token !== 'custom' || ADDR_RE.test(l.custom.trim());
          return (
            <div key={l.id} className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={l.token}
                  onValueChange={(value) => patchLimit(l.id, { token: value as LimitDraft['token'] })}
                  options={[
                    { value: 'stable', label: stableSymbol(skChainShort) },
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
                  onChange={(e) => patchLimit(l.id, { custom: e.target.value })}
                />
              ) : null}
              <input
                className={cn(INPUT_CLS, 'flex-1')}
                value={l.amount}
                inputMode="decimal"
                placeholder={l.token === 'eth' ? '0.1' : '100'}
                onChange={(e) => patchLimit(l.id, { amount: e.target.value })}
              />
              <div className="flex-1">
                <Select
                  value={l.periodId}
                  onValueChange={(value) => patchLimit(l.id, { periodId: value })}
                  options={PERIOD_PRESETS.map((pp) => ({ value: pp.id, label: pp.label }))}
                />
              </div>
              <button
                type="button"
                onClick={() => removeLimit(l.id)}
                aria-label="Remove limit"
                className="shrink-0 text-bds-gray-50 hover:text-bds-red-60"
              >
                <CloseIcon size={10} />
              </button>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" size="sm" onClick={addLimit}>
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
            className="flex items-center justify-between gap-2 rounded-md border border-bds-gray-10 bg-background px-3 py-2 text-[12px] dark:border-white/10 dark:bg-white/5"
          >
            <span className="font-normal">{imp.label}</span>
            <span className="text-bds-gray-60 dark:text-bds-gray-40">{imp.note}</span>
          </div>
        ))}
        {skScopes.length === 0 && impliedScopes.length === 0 ? (
          <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
            No target restriction — key may call anything the limits allow.
          </span>
        ) : null}
        {skScopes.map((s) => {
          const addrOk = !s.target.trim() || ADDR_RE.test(s.target.trim());
          return (
            <div key={s.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  className={cn(INPUT_CLS, 'flex-1', !addrOk && 'border-bds-red-40')}
                  value={s.target}
                  spellCheck={false}
                  placeholder="0x target contract"
                  onChange={(e) => patchScope(s.id, { target: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeScope(s.id)}
                  aria-label="Remove target"
                  className="shrink-0 text-bds-gray-50 hover:text-bds-red-60"
                >
                  <CloseIcon size={10} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setScopeAll(s.id)}
                  className={cn(CHIP_CLS, s.all && CHIP_ON)}
                >
                  All Selectors
                </button>
                {SELECTOR_PRESETS.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => toggleScopeSelector(s.id, sp.selector)}
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
          <Button variant="secondary" size="sm" onClick={addScope}>
            + Add Target
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p className="flex-1 text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          Send-only key on {getDemoChain(skChainShort).name}.
          {skLimits.some((l) => l.token === 'eth')
            ? ' An ETH limit needs at least one allowed target to pay.'
            : ''}
        </p>
        {onClose ? (
          <Button size="sm" variant="secondary" onClick={onClose} disabled={skBusy}>
            Cancel
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={registerSessionKey}
          disabled={skBusy || !skSignerId || formPolicyEmpty}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          {skBusy ? 'Signing Authorization…' : 'Sign Authorization'}
        </Button>
      </div>
    </div>
  );
}
