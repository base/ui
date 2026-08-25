// SessionPolicy + owner-scope helpers for the account demo. Ported from the
// module-scope policy code in base/vibenet `account/page.tsx`. Composes spend
// limits + target/selector allowlists into a single committed SessionPolicy
// binding (see the EIP-8130 SessionPolicy worked example).

import {
  type Address,
  defineSessionPolicy,
  type encodeSessionPolicyConfig,
  type Hex,
  parseEther,
  parseUnits,
} from '@aa';

import { vibenetApi } from '../../../library/client';
import { BASE_SEPOLIA_USDC } from './chains';
import { SCOPE, scopeChips } from './model';
import { short } from '../shared';
import type { AppPolicy } from './model';

export const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;
export const TRANSFER_SELECTOR = '0xa9059cbb' as Hex;

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/** What a session key is restricted to — spend caps and/or a target allowlist. */
export type PolicySpec = {
  limits?: {
    token: 'stable' | 'eth' | Address;
    /** Decimals for a custom token (ignored for stable/eth). @default 18 */
    decimals?: number;
    amount: string;
    /** Recurring window (seconds); `0` = one-time cap. */
    periodSecs: number;
  }[];
  scopes?: { target: string; selectors?: Hex[] }[];
};

/** Spend-limit period choices (independent of the key's expiry). */
export const PERIOD_PRESETS: { id: string; label: string; seconds: number }[] = [
  { id: 'day', label: 'per day', seconds: 86_400 },
  { id: 'week', label: 'per week', seconds: 604_800 },
  { id: 'month', label: 'per month', seconds: 2_592_000 },
  { id: 'once', label: 'one-time', seconds: 0 },
];

/** Known ERC-20 selectors offered as quick toggles in the allowlist. */
export const SELECTOR_PRESETS: { id: string; label: string; selector: Hex }[] = [
  { id: 'transfer', label: 'transfer', selector: TRANSFER_SELECTOR },
  { id: 'approve', label: 'approve', selector: '0x095ea7b3' },
  { id: 'transferFrom', label: 'transferFrom', selector: '0x23b872dd' },
];

// Owner-key permission presets. `0` = full control; otherwise a scope bitmask.
export const OWNER_SCOPE_PRESETS: { id: string; scope: number; label: string }[] = [
  { id: 'full', scope: 0, label: 'Full control' },
  { id: 'send', scope: SCOPE.sender, label: 'Send only' },
  { id: 'send_pay', scope: SCOPE.sender | SCOPE.selfPayer, label: 'Send + pay gas' },
  { id: 'pay', scope: SCOPE.selfPayer, label: 'Pay gas only' },
  { id: 'sponsor', scope: SCOPE.sponsorPayer, label: 'Sponsor only' },
  { id: 'send_nonce', scope: SCOPE.sender | SCOPE.nonce, label: 'Send + sequenced nonce' },
];

export function periodLabel(secs: number): string {
  return PERIOD_PRESETS.find((p) => p.seconds === secs)?.label ?? `/ ${secs}s`;
}

export function stableSymbol(networkShort: string): string {
  return networkShort === 'vibenet' ? 'USDV' : 'USDC';
}

export function scopeLabel(scope: number): string {
  if (!scope) return 'Full Control';
  return OWNER_SCOPE_PRESETS.find((p) => p.scope === scope)?.label ?? scopeChips(scope).join(' + ');
}

// Editable rows backing the register-session-key form.
export type LimitDraft = {
  id: string;
  token: 'stable' | 'eth' | 'custom';
  custom: string;
  amount: string;
  periodId: string;
};
export type ScopeDraft = {
  id: string;
  target: string;
  all: boolean;
  selectors: Hex[];
};

export function newLimitDraft(): LimitDraft {
  return { id: crypto.randomUUID(), token: 'stable', custom: '', amount: '100', periodId: 'month' };
}
export function newScopeDraft(selectors: Hex[] = []): ScopeDraft {
  return { id: crypto.randomUUID(), target: '', all: selectors.length === 0, selectors };
}

/** Resolve the chain stablecoin: USDV on vibenet, USDC on Base Sepolia. */
export async function resolveStable(
  networkShort: string,
): Promise<{ address: Address; symbol: string; decimals: number }> {
  if (networkShort === 'vibenet') {
    const status = await vibenetApi.faucet.status().catch(() => null);
    const a = status?.usdv_address;
    if (a && ADDR_RE.test(a)) return { address: a as Address, symbol: 'USDV', decimals: 6 };
  }
  return { address: BASE_SEPOLIA_USDC as Address, symbol: 'USDC', decimals: 6 };
}

/**
 * Build a committed SessionPolicy config + a human summary from a PolicySpec.
 * Composes spend limits and target/selector scopes into one binding.
 */
export async function buildSessionConfig(
  spec: PolicySpec,
  networkShort: string,
): Promise<{
  config: Parameters<typeof encodeSessionPolicyConfig>[0];
  summary: string;
  limits: { token: Address; symbol: string; decimals: number; allowance: bigint; period: number }[];
}> {
  const scopeMap = new Map<string, Set<Hex> | null>();
  const addScope = (target: string, selectors?: Hex[]) => {
    const t = target.trim();
    if (!ADDR_RE.test(t)) throw new Error(`Invalid target address: ${target}`);
    const key = t.toLowerCase();
    if (selectors?.length) {
      const existing = scopeMap.get(key);
      const set = existing instanceof Set ? existing : new Set<Hex>();
      for (const s of selectors) set.add(s);
      scopeMap.set(key, set);
    } else if (!scopeMap.has(key)) {
      scopeMap.set(key, null);
    }
  };
  for (const s of spec.scopes ?? []) addScope(s.target, s.selectors);

  const tokenLimits: { token: Address; limit: bigint; period: bigint }[] = [];
  const limits: {
    token: Address;
    symbol: string;
    decimals: number;
    allowance: bigint;
    period: number;
  }[] = [];
  const summaryParts: string[] = [];
  let hasEthLimit = false;
  for (const limit of spec.limits ?? []) {
    const amount = limit.amount.trim();
    if (!/^\d*\.?\d+$/.test(amount)) throw new Error('Enter a valid limit amount.');
    const period = BigInt(limit.periodSecs);
    if (limit.token === 'eth') {
      hasEthLimit = true;
      const allowance = parseEther(amount);
      tokenLimits.push({ token: ZERO_ADDR, limit: allowance, period });
      limits.push({ token: ZERO_ADDR, symbol: 'ETH', decimals: 18, allowance, period: limit.periodSecs });
      summaryParts.push(`≤ ${amount} ETH ${periodLabel(limit.periodSecs)}`);
    } else if (limit.token === 'stable') {
      const stable = await resolveStable(networkShort);
      const allowance = parseUnits(amount, stable.decimals);
      tokenLimits.push({ token: stable.address, limit: allowance, period });
      limits.push({
        token: stable.address,
        symbol: stable.symbol,
        decimals: stable.decimals,
        allowance,
        period: limit.periodSecs,
      });
      // Pin the stablecoin to `transfer` so the cap can't be sidestepped.
      addScope(stable.address, [TRANSFER_SELECTOR]);
      summaryParts.push(`≤ ${amount} ${stable.symbol} ${periodLabel(limit.periodSecs)}`);
    } else {
      if (!ADDR_RE.test(limit.token)) throw new Error(`Invalid token address: ${limit.token}`);
      const decimals = limit.decimals ?? 18;
      const allowance = parseUnits(amount, decimals);
      tokenLimits.push({ token: limit.token, limit: allowance, period });
      limits.push({
        token: limit.token,
        symbol: short(limit.token, 4, 4),
        decimals,
        allowance,
        period: limit.periodSecs,
      });
      addScope(limit.token, [TRANSFER_SELECTOR]);
      summaryParts.push(`≤ ${amount} ${short(limit.token, 6, 4)} ${periodLabel(limit.periodSecs)}`);
    }
  }

  const callScopes = [...scopeMap.entries()].map(([target, sels]) => ({
    target: target as Address,
    selectorRules: sels ? [...sels].map((selector) => ({ selector })) : [],
  }));
  if (callScopes.length === 0) throw new Error('Add a spend limit or at least one allowed target.');
  if (hasEthLimit && (spec.scopes ?? []).length === 0)
    throw new Error('An ETH limit needs at least one allowed target to pay.');

  const shownTargets = (spec.scopes ?? []).map((s) => short(s.target, 6, 4));
  if (shownTargets.length) summaryParts.push(`calls ${shownTargets.join(', ')}`);

  return { config: { tokenLimits, callScopes }, summary: summaryParts.join(' · '), limits };
}

/**
 * Re-derive the viem SessionPolicy bundle for a stored AppPolicy. The binding
 * fields (validAfter/validUntil/salt) MUST be re-passed: every `execute` carries
 * the full committed binding, so an omitted field changes the recomputed
 * commitment and the PolicyManager rejects the call.
 */
export function sessionFor(policy: AppPolicy, account: Address) {
  return defineSessionPolicy({
    account,
    policy: policy.policy,
    policyConfig: policy.policyConfig,
    manager: policy.manager,
    validAfter: policy.validAfter,
    validUntil: policy.validUntil,
    salt: policy.salt,
  });
}

/** Wrap raw calls so a policy-gated session key reaches them via the manager. */
export function wrapSessionCalls(
  calls: { to: Address; value: bigint; data: Hex }[],
  policy: AppPolicy,
  account: Address,
): { to: Address; value: bigint; data: Hex }[] {
  const session = sessionFor(policy, account);
  return calls.map((c) => {
    const call = session.executeCall({ target: c.to, value: c.value, data: c.data });
    return { to: call.to, value: call.value ?? 0n, data: (call.data ?? '0x') as Hex };
  });
}
