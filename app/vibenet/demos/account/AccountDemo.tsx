'use client';

// Account demo (EIP-8130). PR1: in-browser signer keys, portable account
// creation (smart + EOA), balances/assets. PR2: transact — a phased calls
// editor (simple + raw), gas estimation, native EIP-8130 sign + broadcast (own
// ETH gas or ERC-8168 payer-sponsored / USDV), a review step, and an activity
// log. Session keys, policies, sub-accounts, and the apps directory land later.
//
// Adapted from base/vibenet `src/app/(vibenet)/account/page.tsx`. The source's
// three-column app shell + custom CSS is rewritten to omni-ui's single content
// column with Tailwind + bds tokens. The backend (balances, faucet, rpc, payer)
// is consumed cross-origin via the shared vibenet API client / RPC URL; nothing
// is proxied same-origin.

import {
  type AaAccountChange,
  type Address,
  authorizeActor,
  canonicalAuthenticators,
  computeAddress8130,
  createPayerClient,
  createPublicClient,
  createWebAuthnCredential,
  defineSessionPolicy,
  ecrecoverAuthenticator,
  encodeSessionPolicyConfig,
  encodeTokenTransfer,
  encodeWalletCalls,
  estimateGas8130,
  generatePrivateKey,
  getConfigSequence8130,
  getTransactionCount8130,
  type Hex,
  http,
  isDeclinedOffer,
  isTokenOffer,
  keccak256,
  key,
  parseUnits,
  privateKeyToAccount,
  revokeActor,
  selectPaymentOption,
  sessionPolicyAbi,
  type Signer,
  to8130Account,
  toEoa8130Account,
  toHex,
  toP256Signer,
  toWebAuthnAccount,
  toWebAuthnSigner,
  upgradeableProxyBytecode,
  waitForTransactionReceipt8130,
} from '@aa';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Text } from '../../../components/ui/Text';
import { vibenetApi } from '../../library/client';
import { ACCOUNT_RPC_URL, VIBENET_EXPLORER_PATH } from '../../library/config';
import { AnimatedAmount } from '../_components/AnimatedAmount';
import { DemoHeader } from '../_components/DemoHeader';
import { DemoTabs } from '../_components/DemoTabs';
import { Stat } from '../_components/Stat';
import { ActivityLog } from './components/ActivityLog';
import { AppsView } from './components/AppsView';
import { ConfigView } from './components/ConfigView';
import { AccountDot, Badge, KindBadge } from './components/primitives';
import { DEMO_APPS, type DemoApp } from './library/apps';
import {
  basescanTx,
  BASE_SEPOLIA_USDC,
  DEMO_CHAINS,
  type DemoChain,
  estimateTxGas,
  getDemoChain,
  PAYER_URL,
} from './library/chains';
import {
  buildCalls,
  buildPhases,
  type CallRow,
  encodeUsdvTransfer,
  isAddressStr,
  newCallRow,
  rowToValid,
  safeGasLimit,
  tryDecodeUsdvTransfer,
  USDV_DECIMALS,
} from './library/calls';
import {
  type AccountType,
  type AppPolicy,
  type AppSessionKey,
  type AppSubAccount,
  deserializeState,
  EXPIRY_PRESETS,
  formatEthWei,
  formatExpiry,
  formatUnits,
  SCOPE,
  scopeChips,
  serializeState,
  type SignerKind,
  type StoredAccount,
  type StoredActor,
} from './library/model';
import {
  buildSessionConfig,
  type LimitDraft,
  newLimitDraft,
  newScopeDraft,
  PERIOD_PRESETS,
  type PolicySpec,
  resolveStable,
  type ScopeDraft,
  scopeLabel,
  wrapSessionCalls,
  ZERO_ADDR,
} from './library/policy';
import {
  type Balances,
  KIND_LABEL,
  type Persisted,
  short,
  signerIdentity,
  type WalletSigner,
} from './shared';

const STORAGE_KEY = 'vibenet.account.v2';
const SPEC_URL = 'https://eip.tools/eip/8130';
const CONTRACTS_URL = 'https://github.com/base/eip-8130';

type View = 'account' | 'transact' | 'apps';

// ---------------------------------------------------------------------------
// Module-scope helpers.
// ---------------------------------------------------------------------------

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

function randomHex32(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeSalt(field: string): Hex {
  const v = field.trim();
  if (HEX32.test(v)) return v as Hex;
  return keccak256(toHex(v || 'vibes'));
}

function actorPairs(actors: { actorId: Hex; authenticator: Address }[]) {
  return actors.map((a) => ({ actorId: a.actorId, authenticator: a.authenticator }));
}

function sortActors<T extends { actorId: Hex }>(actors: T[]): T[] {
  return [...actors].sort((a, b) => (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0));
}

function toStoredActor(s: WalletSigner): StoredActor {
  return {
    signerId: s.id,
    actorId: s.actorId,
    authenticator: s.authenticator,
    kind: s.kind,
    label: s.label,
    identity: signerIdentity(s),
  };
}

// Build a viem-compatible Signer from a stored wallet signer.
async function buildSigner(s: WalletSigner): Promise<Signer> {
  if (s.kind === 'k1') return privateKeyToAccount(s.privateKey as Hex);
  if (s.kind === 'p256') return toP256Signer({ privateKey: s.privateKey as Hex });
  return toWebAuthnSigner(
    toWebAuthnAccount({ credential: s.credential as { id: string; publicKey: Hex } }),
  );
}

// An owner change signed in its own wallet step, waiting to be carried on-chain
// (by "Apply now" or the next Transact). The config signature is captured once;
// the carrying tx adds only its own senderAuth.
type SignedOwnerChange = {
  accountId: string;
  change: AaAccountChange;
  sequence: number;
  resultingOwners: StoredActor[];
  summary: string[];
};

/** Thrown when a tx was broadcast but not confirmed before the timeout. */
class TxPendingError extends Error {
  readonly txHash: Hex;
  constructor(hash: Hex) {
    super(`Transaction is pending — not yet included (${short(hash, 10, 8)}).`);
    this.txHash = hash;
  }
}

// ---------------------------------------------------------------------------

export function AccountDemo() {
  const [view, setView] = useState<View>('account');

  const [signers, setSigners] = useState<WalletSigner[]>([]);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Persisted['activity']>([]);
  const [networkShort, setNetworkShort] = useState<string>('vibenet');

  const [busy, setBusy] = useState<SignerKind | null>(null);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);

  const [activeSignerId, setActiveSignerId] = useState<string | null>(null);
  const [txSignerId, setTxSignerId] = useState<string | null>(null);

  // Balances (Assets tab, both networks).
  const [assetBals, setAssetBals] = useState<Record<string, Balances | null>>({});
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [faucetBusy, setFaucetBusy] = useState<string | null>(null);

  // Transact balances (active network) + builder.
  const [balances, setBalances] = useState<Balances | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [calls, setCalls] = useState<CallRow[]>(() => [newCallRow()]);
  const [callsAdvanced, setCallsAdvanced] = useState(false);
  const [usdvRecipientDrafts, setUsdvRecipientDrafts] = useState<Record<string, string>>({});
  const [usdvAmountDrafts, setUsdvAmountDrafts] = useState<Record<string, string>>({});
  const [metaField, setMetaField] = useState('');
  const [gasMode, setGasMode] = useState<'eth' | 'free' | 'usdv'>('eth');
  const [signing, setSigning] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'' | 'submitting' | 'confirming'>('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [result, setResult] = useState<{
    serialized?: Hex;
    txHash?: Hex;
    by: string;
    kind: SignerKind;
    gasNote?: string;
    pending?: boolean;
  } | null>(null);

  // Regenesis (devnet reset) detection.
  const [genesisHash, setGenesisHash] = useState<string | null>(null);
  const [regenesisNotice, setRegenesisNotice] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  // Create modal.
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<AccountType>('smart');
  const [modalLabel, setModalLabel] = useState('');
  const [modalSalt, setModalSalt] = useState(() => randomHex32());
  const [modalIds, setModalIds] = useState<string[]>([]);
  const [modalEoaId, setModalEoaId] = useState<string | null>(null);

  // Config view (owners / session keys / sub-accounts).
  const [cfgTab, setCfgTab] = useState<'assets' | 'owners' | 'session' | 'subaccounts'>('assets');
  const [ownersEditing, setOwnersEditing] = useState(false);
  const [ownerDraft, setOwnerDraft] = useState<string[]>([]);
  const [scopeDraft, setScopeDraft] = useState<Record<string, number>>({});
  const [signedChange, setSignedChange] = useState<SignedOwnerChange | null>(null);
  const [applying, setApplying] = useState(false);
  const [configTx, setConfigTx] = useState<{ hash: Hex; label: string } | null>(null);

  // Session-key form + apply state.
  const [sessionAdding, setSessionAdding] = useState(false);
  const [skSignerId, setSkSignerId] = useState('');
  const [skExpiryId, setSkExpiryId] = useState('7d');
  const [skChainShort, setSkChainShort] = useState('vibenet');
  const [skApplyingId, setSkApplyingId] = useState<string | null>(null);
  const [skLimits, setSkLimits] = useState<LimitDraft[]>(() => [newLimitDraft()]);
  const [skScopes, setSkScopes] = useState<ScopeDraft[]>([]);
  const [skBusy, setSkBusy] = useState(false);
  const [policyRemaining, setPolicyRemaining] = useState<
    Record<
      string,
      Record<string, { remaining: bigint; allowance: bigint; symbol: string; decimals: number; period: number }>
    >
  >({});

  // Sub-account form.
  const [saLabel, setSaLabel] = useState('');
  const [saBusy, setSaBusy] = useState(false);

  // Apps directory.
  const [appBusy, setAppBusy] = useState<string | null>(null);

  const chain = useMemo(() => getDemoChain(networkShort), [networkShort]);
  const code = useMemo(
    () => upgradeableProxyBytecode(chain.deployment.accounts.upgradeable),
    [chain],
  );

  // A viem public client pointed at vibenet's cross-origin RPC route — reads
  // nonces / receipts and broadcasts native 8130 txs, plus the genesis hash.
  const makeRpcClient = useCallback(
    () =>
      createPublicClient({
        chain: {
          id: chain.id || 84538453,
          name: 'Vibenet',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: [ACCOUNT_RPC_URL] } },
        },
        transport: http(ACCOUNT_RPC_URL),
      }),
    [chain],
  );

  // --- persistence -------------------------------------------------------
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = deserializeState<Persisted>(raw);
        setSigners(s.signers ?? []);
        setAccounts(s.accounts ?? []);
        setActiveAccountId(s.activeAccountId ?? null);
        setActivity(s.activity ?? []);
        setGenesisHash(s.genesisHash ?? null);
        if (s.network) setNetworkShort(s.network);
      }
    } catch {
      /* ignore corrupt state */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        serializeState<Persisted>({
          signers,
          accounts,
          activeAccountId,
          activity,
          network: networkShort,
          genesisHash: genesisHash ?? undefined,
        }),
      );
    } catch {
      /* quota / unavailable */
    }
  }, [signers, accounts, activeAccountId, activity, networkShort, genesisHash]);

  // --- regenesis detection ----------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const checkGenesis = async () => {
      let hash: string | null = null;
      try {
        const block = await makeRpcClient().getBlock({ blockNumber: 0n });
        hash = block.hash ?? null;
      } catch {
        return;
      }
      if (!hash || cancelled || !loaded.current) return;
      setGenesisHash((prev) => {
        if (prev && prev !== hash) {
          setAccounts((accts) => accts.map((a) => (a.deployed ? { ...a, deployed: false } : a)));
          setRegenesisNotice(true);
        }
        return hash;
      });
    };
    checkGenesis();
    const t = setInterval(checkGenesis, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [makeRpcClient]);

  const acct = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  // Owner signers for the active account.
  const ownerSigners = useMemo(
    () => (acct ? signers.filter((s) => acct.owners.some((o) => o.signerId === s.id)) : []),
    [acct, signers],
  );
  const activeSigner =
    ownerSigners.find((s) => s.id === activeSignerId) ?? ownerSigners[0] ?? null;

  // Session-key signers held in the wallet (scoped actors, not owners).
  const sessionSigners = useMemo(() => {
    if (!acct) return [] as WalletSigner[];
    const ownerIds = new Set(acct.owners.map((o) => o.signerId));
    const seen = new Set<string>();
    return acct.sessionKeys
      .map((sk) => signers.find((s) => s.id === sk.signerId))
      .filter((s): s is WalletSigner => {
        if (!s || ownerIds.has(s.id) || seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
  }, [acct, signers]);

  // Staged owner changes (draft vs applied owners).
  const pendingAuthorize = useMemo(() => {
    if (!acct) return [] as WalletSigner[];
    return signers.filter(
      (s) => ownerDraft.includes(s.id) && !acct.owners.some((o) => o.signerId === s.id),
    );
  }, [acct, signers, ownerDraft]);
  const pendingRevoke = useMemo(() => {
    if (!acct) return [] as StoredActor[];
    return acct.owners.filter((o) => !ownerDraft.includes(o.signerId));
  }, [acct, ownerDraft]);
  const pendingScope = useMemo(() => {
    if (!acct) return [] as (StoredActor & { fromScope: number; toScope: number })[];
    return acct.owners
      .filter((o) => ownerDraft.includes(o.signerId))
      .map((o) => {
        const fromScope = o.scope ?? 0;
        const toScope = scopeDraft[o.signerId] ?? fromScope;
        return { ...o, fromScope, toScope };
      })
      .filter((o) => o.toScope !== o.fromScope);
  }, [acct, ownerDraft, scopeDraft]);
  const keyChangeCount = pendingAuthorize.length + pendingRevoke.length + pendingScope.length;

  // Owners valid *after* the staged changes apply — the keys eligible to sign a
  // tx that carries the change.
  const postChangeOwnerSigners = useMemo(() => {
    if (!acct) return [] as WalletSigner[];
    const revokedIds = new Set(pendingRevoke.map((o) => o.signerId));
    const kept = ownerSigners.filter((s) => !revokedIds.has(s.id));
    const keptIds = new Set(kept.map((s) => s.id));
    const added = pendingAuthorize.filter((s) => !keptIds.has(s.id));
    return [...kept, ...added];
  }, [acct, ownerSigners, pendingRevoke, pendingAuthorize]);

  const signableSigners = useMemo(
    () => [...postChangeOwnerSigners, ...sessionSigners],
    [postChangeOwnerSigners, sessionSigners],
  );
  const txSigner =
    signableSigners.find((s) => s.id === txSignerId) ??
    postChangeOwnerSigners.find((s) => s.id === activeSignerId) ??
    postChangeOwnerSigners[0] ??
    activeSigner;
  const txIsSession = !!txSigner && sessionSigners.some((s) => s.id === txSigner.id);
  const activeSessionKey =
    txIsSession && txSigner
      ? (acct?.sessionKeys.find((sk) => sk.signerId === txSigner.id) ?? null)
      : null;

  type PendingChangeItem = {
    change: AaAccountChange;
    sequence: number;
    installCall?: { to: Address; value: bigint; data: Hex };
    sessionId?: string;
    resultingOwners?: StoredActor[];
  };
  const pendingChanges = useMemo<PendingChangeItem[]>(() => {
    if (!acct) return [];
    const items: PendingChangeItem[] = [];
    if (signedChange && signedChange.accountId === acct.id)
      items.push({
        change: signedChange.change,
        sequence: signedChange.sequence,
        resultingOwners: signedChange.resultingOwners,
      });
    for (const sk of acct.sessionKeys)
      if (sk.pendingAuth)
        items.push({
          change: sk.pendingAuth.change,
          sequence: sk.pendingAuth.sequence,
          installCall: sk.pendingAuth.installCall,
          sessionId: sk.id,
        });
    return items.sort((a, b) => a.sequence - b.sequence);
  }, [acct, signedChange]);

  // Which staged changes ride an outgoing tx. Owner sends never install a
  // session policy; session sends carry that key's authorize+install (plus any
  // lower-sequence prerequisites for continuity).
  const pendingBundleFor = (opts: {
    mode: 'owner-send' | 'session-send' | 'apply-all';
    sessionId?: string;
  }): PendingChangeItem[] => {
    if (opts.mode === 'apply-all') return pendingChanges;
    if (opts.mode === 'owner-send')
      return pendingChanges.filter(
        (i) => !i.sessionId && !pendingChanges.some((s) => s.sessionId && s.sequence < i.sequence),
      );
    const active = pendingChanges.find((i) => i.sessionId === opts.sessionId);
    if (!active) return pendingChanges.filter((i) => !i.sessionId);
    return pendingChanges.filter((i) => i.sequence <= active.sequence);
  };

  // Count of staged (signed, not-yet-landed) config changes — each consumes one
  // config sequence. A NEW change binds to `liveSeq + this` so stacked changes
  // get consecutive sequences.
  const pendingChangeCount = (opts?: { includeOwner?: boolean }) => {
    const includeOwner = opts?.includeOwner ?? true;
    const sessions = (acct?.sessionKeys ?? []).filter((sk) => sk.pendingAuth).length;
    const owner =
      includeOwner && !!acct && !!signedChange && signedChange.accountId === acct.id ? 1 : 0;
    return sessions + owner;
  };

  // A current owner able to authorize config changes (must be valid *before* the
  // change). Prefer the tx signer when it's already a current owner.
  const configChangeSigner = useMemo<WalletSigner | null>(() => {
    if (keyChangeCount === 0) return null;
    if (txSigner && ownerSigners.some((s) => s.id === txSigner.id)) return txSigner;
    return ownerSigners.find((s) => s.id === activeSignerId) ?? ownerSigners[0] ?? null;
  }, [keyChangeCount, txSigner, ownerSigners, activeSignerId]);

  const ownerChangeSigned = !!(acct && signedChange && signedChange.accountId === acct.id);

  const callsValid = useMemo(() => calls.every(rowToValid), [calls]);
  const metadataHex = useMemo<Hex | undefined>(
    () => (metaField.trim() ? (toHex(metaField.trim()) as Hex) : undefined),
    [metaField],
  );
  const gasEstimate = useMemo(() => {
    if (!acct) return 0;
    return estimateTxGas({
      mode: chain.mode,
      deploy: !acct.deployed,
      calls: calls.length,
      keyChanges: keyChangeCount,
    });
  }, [acct, chain.mode, calls.length, keyChangeCount]);

  // Re-sync owner draft + stale results when the active account changes.
  useEffect(() => {
    setOwnerDraft(acct ? acct.owners.map((o) => o.signerId) : []);
    setScopeDraft(
      acct ? Object.fromEntries(acct.owners.map((o) => [o.signerId, o.scope ?? 0])) : {},
    );
    setActiveSignerId(acct ? (acct.owners[0]?.signerId ?? null) : null);
    setTxSignerId(null);
    setSignedChange(null);
    setOwnersEditing(false);
    setSessionAdding(false);
    setSkChainShort(networkShort);
    setSkLimits([newLimitDraft()]);
    setSkScopes([]);
    setResult(null);
    setReviewOpen(false);
  }, [activeAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- assets: ETH + stablecoin across demo networks --------------------
  useEffect(() => {
    if (!acct) return;
    let cancelled = false;
    setAssetsLoading(true);
    setAssetBals({});
    Promise.all(
      DEMO_CHAINS.map((c) => c.shortName as 'vibenet' | 'base-sepolia').map((net) =>
        vibenetApi.account
          .balances(acct.address, net)
          .then((b) => [net, b] as const)
          .catch(() => [net, null] as const),
      ),
    )
      .then((entries) => {
        if (!cancelled) setAssetBals(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setAssetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [acct]);

  // --- transact balances (active network) --------------------------------
  useEffect(() => {
    if (!acct || view !== 'transact') return;
    let cancelled = false;
    setBalLoading(true);
    setBalances(null);
    vibenetApi.account
      .balances(acct.address, networkShort as 'vibenet' | 'base-sepolia')
      .then((b) => {
        if (!cancelled) setBalances(b);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [acct, view, networkShort]);

  // --- session-key live spend remaining ----------------------------------
  // Read each installed session key's per-token budget from the SessionPolicy
  // (getTokenLimit → cap + window, getCurrentSpend → usage) for the card's
  // "remaining" readout. Pending (not-yet-installed) keys are skipped.
  const sessionPolicyKey = useMemo(
    () =>
      (acct?.sessionKeys ?? [])
        .map((sk) => `${sk.id}:${sk.policy?.commitment ?? ''}:${sk.pendingAuth ? 'p' : 'd'}`)
        .join('|'),
    [acct],
  );
  useEffect(() => {
    if (!acct) {
      setPolicyRemaining({});
      return;
    }
    const keys = acct.sessionKeys.filter(
      (sk) => !sk.pendingAuth && sk.policy?.commitment && sk.policy.policy,
    );
    if (keys.length === 0) {
      setPolicyRemaining({});
      return;
    }
    let cancelled = false;
    (async () => {
      const client = makeRpcClient() as unknown as {
        readContract: (args: unknown) => Promise<unknown>;
      };
      const nowSecs = BigInt(Math.floor(Date.now() / 1000));
      const stable = await resolveStable(chain.shortName).catch(() => null);
      const out: Record<
        string,
        Record<string, { remaining: bigint; allowance: bigint; symbol: string; decimals: number; period: number }>
      > = {};
      for (const sk of keys) {
        const policy = sk.policy!;
        const meta = new Map<string, { symbol: string; decimals: number }>();
        for (const lim of policy.limits ?? [])
          meta.set(lim.token.toLowerCase(), { symbol: lim.symbol, decimals: lim.decimals });
        if (!meta.has(ZERO_ADDR.toLowerCase()))
          meta.set(ZERO_ADDR.toLowerCase(), { symbol: 'ETH', decimals: 18 });
        if (stable && !meta.has(stable.address.toLowerCase()))
          meta.set(stable.address.toLowerCase(), { symbol: stable.symbol, decimals: stable.decimals });

        const perToken: Record<
          string,
          { remaining: bigint; allowance: bigint; symbol: string; decimals: number; period: number }
        > = {};
        for (const [token, info] of meta) {
          try {
            const [set, allowance, period] = (await client.readContract({
              address: policy.policy,
              abi: sessionPolicyAbi,
              functionName: 'getTokenLimit',
              args: [policy.commitment, token as Address],
            })) as [boolean, bigint, number];
            if (!set) continue;
            const spend = (await client.readContract({
              address: policy.policy,
              abi: sessionPolicyAbi,
              functionName: 'getCurrentSpend',
              args: [policy.commitment, token as Address],
            })) as { end: bigint | number; spend: bigint | number };
            const end = BigInt(spend.end ?? 0);
            const used = end !== 0n && nowSecs >= end ? 0n : BigInt(spend.spend ?? 0);
            perToken[token] = {
              remaining: allowance > used ? allowance - used : 0n,
              allowance,
              symbol: info.symbol,
              decimals: info.decimals,
              period: Number(period),
            };
          } catch {
            /* RPC/read failure — fall back to the static cap */
          }
        }
        if (Object.keys(perToken).length > 0) out[sk.id] = perToken;
      }
      if (!cancelled) setPolicyRemaining(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPolicyKey, chain.shortName]);

  // --- helpers -----------------------------------------------------------
  const copy = async (text: string, k: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(k);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* noop */
    }
  };

  const pushActivity = (e: Omit<Persisted['activity'][number], 'id' | 'ts'>) =>
    setActivity((prev) => [{ id: crypto.randomUUID(), ts: Date.now(), ...e }, ...prev]);

  const updateAccount = useCallback(
    (id: string, patch: Partial<StoredAccount> | ((a: StoredAccount) => StoredAccount)) =>
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === id ? (typeof patch === 'function' ? patch(a) : { ...a, ...patch }) : a,
        ),
      ),
    [],
  );

  const refreshVibenetBalances = async (): Promise<Balances | null> => {
    if (!acct) return null;
    const b = await vibenetApi.account.balances(acct.address, 'vibenet').catch(() => null);
    setAssetBals((prev) => ({ ...prev, vibenet: b }));
    if (networkShort === 'vibenet') setBalances(b);
    return b;
  };

  const requestFaucet = async () => {
    if (!acct) return;
    setFaucetBusy('eth+usdv');
    setError('');
    try {
      await Promise.all([
        vibenetApi.faucet.drip({ address: acct.address }),
        vibenetApi.faucet.dripUsdv({ address: acct.address }),
      ]);
      const ethBefore = BigInt(assetBals.vibenet?.eth_wei ?? '0');
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        const fresh = await refreshVibenetBalances();
        if (BigInt(fresh?.eth_wei ?? '0') > ethBefore) break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFaucetBusy(null);
    }
  };

  const createSigner = async (kind: SignerKind): Promise<WalletSigner | null> => {
    setError('');
    setBusy(kind);
    try {
      const n = signers.filter((s) => s.kind === kind).length + 1;
      const label = `${KIND_LABEL[kind]} ${n}`;
      let ws: WalletSigner;
      if (kind === 'k1') {
        const pk = generatePrivateKey();
        const owner = privateKeyToAccount(pk);
        const a = key.k1(owner.address);
        ws = {
          id: crypto.randomUUID(),
          kind,
          label,
          privateKey: pk,
          address: owner.address,
          actorId: a.actorId,
          authenticator: a.authenticator,
        };
      } else if (kind === 'p256') {
        const pk = generatePrivateKey();
        const s = toP256Signer({ privateKey: pk });
        const a = key.p256(s.publicKey);
        ws = {
          id: crypto.randomUUID(),
          kind,
          label,
          privateKey: pk,
          publicKey: s.publicKey,
          actorId: a.actorId,
          authenticator: a.authenticator,
        };
      } else {
        const credential = await createWebAuthnCredential({ name: label });
        const a = key.passkey(credential.publicKey);
        ws = {
          id: crypto.randomUUID(),
          kind,
          label,
          credential: { id: credential.id, publicKey: credential.publicKey },
          actorId: a.actorId,
          authenticator: a.authenticator,
        };
      }
      if (signers.some((s) => s.actorId === ws.actorId)) {
        setError('That key is already in your wallet (same actor). Skipped.');
        return null;
      }
      setSigners((prev) => [...prev, ws]);
      return ws;
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(
        e.name === 'NotAllowedError' ? 'Passkey prompt was dismissed.' : (e.message ?? String(err)),
      );
      return null;
    } finally {
      setBusy(null);
    }
  };

  const renameSigner = (id: string, raw: string) => {
    const label = raw.trim();
    setRenameId(null);
    if (!label) return;
    setSigners((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
    setAccounts((prev) =>
      prev.map((a) => ({
        ...a,
        initialActors: a.initialActors.map((o) => (o.signerId === id ? { ...o, label } : o)),
        owners: a.owners.map((o) => (o.signerId === id ? { ...o, label } : o)),
        sessionKeys: a.sessionKeys.map((sk) => (sk.signerId === id ? { ...sk, label } : sk)),
      })),
    );
  };

  const openCreate = () => {
    setModalType('smart');
    setModalLabel('');
    setModalSalt(randomHex32());
    setModalIds([]);
    setModalEoaId(null);
    setError('');
    setModalOpen(true);
  };

  const clearAllData = () => {
    setSigners([]);
    setAccounts([]);
    setActiveAccountId(null);
    setActivity([]);
    setView('account');
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* quota / unavailable */
    }
    setClearConfirm(false);
  };

  // Create-modal derivations.
  const eoaSigners = useMemo(() => signers.filter((s) => s.kind === 'k1'), [signers]);
  const modalEoaSigner = useMemo(
    () => eoaSigners.find((s) => s.id === modalEoaId) ?? null,
    [eoaSigners, modalEoaId],
  );
  const modalSigners = useMemo(
    () => signers.filter((s) => modalIds.includes(s.id)),
    [signers, modalIds],
  );
  const modalSalt32 = useMemo(() => normalizeSalt(modalSalt), [modalSalt]);
  const modalAddress = useMemo<Address | null>(() => {
    if (modalType === 'eoa') return modalEoaSigner?.address ?? null;
    if (modalSigners.length === 0) return null;
    const ids = new Set(modalSigners.map((s) => s.actorId));
    if (ids.size !== modalSigners.length) return null;
    try {
      return computeAddress8130({
        userSalt: modalSalt32,
        code,
        initialActors: sortActors(actorPairs(modalSigners)),
        accountConfigAddress: chain.deployment.accountConfiguration,
      });
    } catch {
      return null;
    }
  }, [modalType, modalEoaSigner, modalSigners, modalSalt32, code, chain.deployment.accountConfiguration]);

  const createAccount = () => {
    if (!modalAddress) return;
    if (modalType === 'eoa') {
      if (!modalEoaSigner) return;
      const selfActor = toStoredActor(modalEoaSigner);
      const account: StoredAccount = {
        id: crypto.randomUUID(),
        label: modalLabel.trim() || `Account ${accounts.length + 1}`,
        type: 'eoa',
        saltField: '',
        salt: `0x${'00'.repeat(32)}` as Hex,
        address: modalAddress,
        delegate: chain.deployment.accounts.default,
        initialActors: [selfActor],
        owners: [selfActor],
        deployed: false,
        configSeq: 0,
        sessionKeys: [],
        subAccounts: [],
        createdAt: Date.now(),
      };
      setAccounts((prev) => [...prev, account]);
      setActiveAccountId(account.id);
      pushActivity({
        kind: 'create',
        title: `EOA account · ${account.label}`,
        detail: 'delegates to DefaultAccount on first use',
        account: account.address,
      });
      setModalOpen(false);
      return;
    }
    if (modalSigners.length === 0) return;
    const initialActors = modalSigners.map(toStoredActor);
    const account: StoredAccount = {
      id: crypto.randomUUID(),
      label: modalLabel.trim() || `Account ${accounts.length + 1}`,
      type: 'smart',
      saltField: modalSalt,
      salt: modalSalt32,
      address: modalAddress,
      initialActors,
      owners: [...initialActors],
      deployed: false,
      configSeq: 0,
      sessionKeys: [],
      subAccounts: [],
      createdAt: Date.now(),
    };
    setAccounts((prev) => [...prev, account]);
    setActiveAccountId(account.id);
    pushActivity({
      kind: 'create',
      title: `Account created · ${account.label}`,
      detail: 'stored locally · deploys on first use',
      changes: initialActors.map((a) => `${a.label} (${KIND_LABEL[a.kind]})`),
      account: account.address,
    });
    setModalOpen(false);
  };

  // --- 8130 account handle + first-deploy change -------------------------
  const nativeAccountFor = (a: StoredAccount, signer: Signer, authenticator: Address) => {
    const isDefaultEoaActor =
      a.type === 'eoa' &&
      authenticator === ecrecoverAuthenticator &&
      !!signer.address &&
      signer.address.toLowerCase() === a.address.toLowerCase();
    if (isDefaultEoaActor) return toEoa8130Account(signer);
    if (a.type === 'eoa') {
      return to8130Account({ signer, address: a.address as Address, authenticator });
    }
    return to8130Account({
      signer,
      userSalt: a.salt,
      code,
      initialActors: sortActors(actorPairs(a.initialActors)),
      authenticator,
      accountConfigAddress: chain.deployment.accountConfiguration,
    });
  };

  const firstDeployChange = (
    a: StoredAccount,
    account: ReturnType<typeof nativeAccountFor>,
  ): AaAccountChange =>
    a.type === 'eoa'
      ? account.delegate(a.delegate ?? chain.deployment.accounts.default)
      : (account as ReturnType<typeof to8130Account>).create();

  // Broadcast a signed 8130 tx and wait for inclusion. Throws TxPendingError on
  // timeout (submitted but unconfirmed), a plain Error if any phase reverts.
  const broadcast8130 = async (
    signedTx: Hex,
    onStatus?: (s: 'submitting' | 'confirming') => void,
  ): Promise<Hex> => {
    const client = makeRpcClient();
    onStatus?.('submitting');
    const txHash = (await client.request({
      method: 'eth_sendRawTransaction',
      params: [signedTx],
    })) as Hex;
    onStatus?.('confirming');
    try {
      const receipt = await waitForTransactionReceipt8130(client as never, {
        hash: txHash,
        timeout: 30_000,
      });
      if (receipt.status === '0x0')
        throw new Error(`Transaction reverted onchain (${short(txHash, 10, 8)}).`);
      const phases = receipt.eip8130?.phaseStatuses ?? [];
      const failedPhase = phases.findIndex((s: Hex) => s === '0x0');
      if (failedPhase !== -1)
        throw new Error(`Phase ${failedPhase} reverted (tx ${short(txHash, 10, 8)}).`);
    } catch (err) {
      if ((err as Error)?.message?.includes('timed out')) throw new TxPendingError(txHash);
      throw err;
    }
    return txHash;
  };

  // Live on-chain config sequence for a deployed account (null on any error, so
  // callers fall back to the stored value).
  const fetchOnChainConfigSeq = async (address: Address): Promise<number | null> => {
    try {
      const { local } = await getConfigSequence8130(makeRpcClient(), {
        accountConfiguration: chain.deployment.accountConfiguration as Address,
        account: address,
      });
      return Number(local);
    } catch {
      return null;
    }
  };

  // Compose + sign a native EIP-8130 transaction: first-use deploy change,
  // any pre-signed owner/session config changes (carried in sequence order),
  // phase-0 installs / payer pre-calls, and the user calls (wrapped through the
  // PolicyManager when a session key signs). Returns the signed tx + the config
  // sequence it advances to.
  const signComposed = async (
    a: StoredAccount,
    signerWS: WalletSigner,
    rows: CallRow[],
    presignedChanges: AaAccountChange[],
    changeSeq: number | null,
    meta: Hex | undefined,
    sessionPolicy?: AppPolicy,
    installCalls?: { to: Address; value: bigint; data: Hex }[],
    payerOpt?: { address: Address; phase0?: { to: Address; data: Hex }[] },
  ): Promise<{ serialized: Hex; nextSeq: number }> => {
    const signer = await buildSigner(signerWS);
    const account = nativeAccountFor(a, signer, signerWS.authenticator);
    const chainId = chain.id || 84532;
    const accountChanges: AaAccountChange[] = [];
    let nextSeq = a.configSeq;

    // Auto-detect a stale "deployed" flag (e.g. after a devnet reset): if there's
    // no code onchain, treat as undeployed and include the create/delegate change.
    let effectivelyDeployed = a.deployed;
    if (a.deployed) {
      try {
        const codeAt = await makeRpcClient().request({
          method: 'eth_getCode',
          params: [account.address as `0x${string}`, 'latest'],
        });
        if (!codeAt || codeAt === '0x') {
          effectivelyDeployed = false;
          updateAccount(a.id, { deployed: false });
        }
      } catch {
        /* RPC unavailable — keep the stored flag */
      }
    }
    if (!effectivelyDeployed) accountChanges.push(firstDeployChange(a, account));
    const installs = installCalls ?? [];
    if (presignedChanges.length > 0) {
      nextSeq = changeSeq ?? a.configSeq;
      accountChanges.push(...presignedChanges);
    }

    const { phase0: userPhase0, phase1: userPhase1 } = buildPhases(rows, account.address);
    const phases: { to: Address; value?: bigint; data?: Hex }[][] = [];
    if (sessionPolicy) {
      // A gated session key may only reach the PolicyManager, so wrap every user
      // call as `PolicyManager.execute`. On first use the install runs in phase 0
      // (before any execute), plus any payer USDV payment (also wrapped).
      const sessionPhase0: { to: Address; value?: bigint; data?: Hex }[] = [...installs];
      if (payerOpt?.phase0 && payerOpt.phase0.length > 0)
        sessionPhase0.push(
          ...wrapSessionCalls(
            payerOpt.phase0.map((c) => ({ to: c.to, value: 0n, data: c.data })),
            sessionPolicy,
            account.address,
          ),
        );
      if (sessionPhase0.length > 0) phases.push(sessionPhase0);
      phases.push(wrapSessionCalls([...userPhase0, ...userPhase1], sessionPolicy, account.address));
    } else {
      // [installs?, payerPreCalls?, userPhase0?, userPhase1]
      if (installs.length > 0) phases.push(installs);
      if (payerOpt?.phase0 && payerOpt.phase0.length > 0)
        phases.push(payerOpt.phase0.map((c) => ({ to: c.to, value: 0n, data: c.data })));
      if (userPhase0.length > 0) phases.push(userPhase0);
      phases.push(userPhase1);
    }

    // Structural gas-floor accounting: installs + wrapped session calls are
    // "heavy" (PolicyManager frames + first-use SSTOREs); everything else plain.
    const totalCalls = phases.reduce((n, p) => n + p.length, 0);
    const heavyCallCount =
      installs.length + (sessionPolicy ? userPhase0.length + userPhase1.length : 0);
    const plainCallCount = Math.max(totalCalls - heavyCallCount, 1);
    const wire = encodeWalletCalls({ account: account.address, calls: phases });

    let nonceSequence: bigint;
    try {
      nonceSequence = await getTransactionCount8130(makeRpcClient(), {
        address: account.address as Address,
        nonceKey: 0n,
      });
    } catch {
      nonceSequence = effectivelyDeployed ? 1n : 0n;
    }

    const senderAuthVerifier: Address =
      signerWS.kind === 'p256'
        ? canonicalAuthenticators.p256
        : signerWS.kind === 'passkey'
          ? canonicalAuthenticators.passkey
          : canonicalAuthenticators.k1;

    const floor = estimateTxGas({
      mode: chain.mode,
      deploy: !effectivelyDeployed,
      calls: plainCallCount,
      keyChanges: accountChanges.filter((c) => c.type === 'config').length,
      policyCalls: heavyCallCount,
    });
    let gasLimit: bigint;
    if (chain.mode === 'eip8130-native') {
      try {
        const estimated = await estimateGas8130(makeRpcClient(), {
          sender: account.address as Address,
          accountChanges,
          calls: phases,
          nonceSequence: Number(nonceSequence),
          senderAuthVerifier,
          ...(payerOpt ? { payer: payerOpt.address } : {}),
        });
        gasLimit = safeGasLimit(estimated, floor);
      } catch {
        gasLimit = BigInt(floor || 200_000);
      }
    } else {
      gasLimit = BigInt(floor || 200_000);
    }

    const serialized = await account.signTransaction({
      chainId,
      accountChanges,
      calls: wire,
      metadata: meta,
      nonceKey: 0n,
      nonceSequence,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
      gas: gasLimit,
      ...(payerOpt ? { payer: payerOpt.address, payerAuth: '0x' as Hex } : {}),
    });
    return { serialized, nextSeq };
  };

  // Record the outcome of a broadcast tx into the result panel + activity log.
  const recordResult = (
    a: StoredAccount,
    serialized: Hex,
    txHash: Hex,
    pending: boolean,
    by: WalletSigner,
    gasNote?: string,
    extraChanges: string[] = [],
  ) => {
    setResult({ serialized, txHash, by: by.label, kind: by.kind, pending, gasNote });
    pushActivity({
      kind: a.deployed && !pending ? 'transact' : 'create',
      txHash,
      title: pending
        ? 'Transaction pending · not yet included'
        : a.deployed
          ? `Transaction landed onchain${gasNote ? ' (payer gas)' : ''}`
          : a.type === 'eoa'
            ? 'EOA delegated + first action'
            : 'Account deployed + first action',
      changes: [
        ...(!a.deployed
          ? [a.type === 'eoa' ? 'delegate → DefaultAccount' : `create · ${a.initialActors.length} keys`]
          : []),
        ...(pending ? ['⚠ pending — not yet included'] : []),
        ...(gasNote ? [gasNote] : []),
        ...extraChanges,
      ],
      calls: calls.length,
      metadata: metaField.trim() || undefined,
      network: chain.name,
      mode: chain.mode,
      serialized,
      account: a.address,
    });
  };

  // Apply the on-chain effects a landed tx carried: mark deployed, advance the
  // config sequence, apply a bundled owner change, and clear bundled session
  // keys' pendingAuth.
  const applyLandedBundle = (a: StoredAccount, nextSeq: number, bundle: PendingChangeItem[]) => {
    const ownerItem = bundle.find((i) => i.resultingOwners);
    const bundledSessionIds = new Set(bundle.flatMap((i) => (i.sessionId ? [i.sessionId] : [])));
    const newOwners = ownerItem?.resultingOwners ?? a.owners;
    updateAccount(a.id, (acc) => ({
      ...acc,
      deployed: true,
      configSeq: nextSeq,
      owners: ownerItem?.resultingOwners ?? acc.owners,
      sessionKeys: acc.sessionKeys.map((sk) =>
        bundledSessionIds.has(sk.id) ? { ...sk, pendingAuth: undefined } : sk,
      ),
    }));
    if (ownerItem) {
      setSignedChange(null);
      setOwnerDraft(newOwners.map((o) => o.signerId));
      setScopeDraft(Object.fromEntries(newOwners.map((o) => [o.signerId, o.scope ?? 0])));
    }
  };

  // Summary of the config changes riding a transact (for the activity log).
  const sendExtraChanges = (): string[] =>
    txIsSession && txSigner
      ? [`via session key · ${txSigner.label}`]
      : [
          ...pendingAuthorize.map((s) => `authorize ${s.label}`),
          ...pendingRevoke.map((o) => `revoke ${o.label}`),
          ...pendingScope.map((o) => `scope ${o.label} → ${scopeLabel(o.toScope)}`),
        ];

  // Transact: native offline sign, own ETH gas.
  const doSignNative = async () => {
    if (!acct || !txSigner || !callsValid) return;
    const sessionPolicy = activeSessionKey?.policy;
    if (txIsSession && !acct.deployed && !activeSessionKey?.pendingAuth) {
      setError('Authorize this session key with an owner key first (Apply now).');
      return;
    }
    setSigning(true);
    setError('');
    try {
      const bundle = pendingBundleFor(
        txIsSession ? { mode: 'session-send', sessionId: activeSessionKey?.id } : { mode: 'owner-send' },
      );
      const presigned = bundle.map((i) => i.change);
      const installs = bundle.flatMap((i) => (i.installCall ? [i.installCall] : []));
      const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : null;
      const extra = sendExtraChanges();
      const { serialized, nextSeq } = await signComposed(
        acct,
        txSigner,
        calls,
        presigned,
        changeSeq,
        metadataHex,
        sessionPolicy,
        installs,
        undefined,
      );
      let txHash: Hex;
      let pending = false;
      try {
        txHash = await broadcast8130(serialized, setSubmitStatus);
      } catch (err) {
        if (err instanceof TxPendingError) {
          txHash = err.txHash;
          pending = true;
        } else throw err;
      }
      if (!pending) applyLandedBundle(acct, nextSeq, bundle);
      recordResult(acct, serialized, txHash, pending, txSigner, undefined, extra);
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      setSigning(false);
      setSubmitStatus('');
    }
  };

  // Transact: native sign co-signed by an ERC-8168 payer service.
  //  - "free": prefer per-account sponsorship, fall back to USDV when spent.
  //  - "usdv": always pay gas in USDV (phase-0 transfer to the payer).
  const doSponsoredSign = async () => {
    if (!acct || !txSigner || !callsValid) return;
    const sessionPolicy = activeSessionKey?.policy;
    if (txIsSession && !acct.deployed && !activeSessionKey?.pendingAuth) {
      setError('Authorize this session key with an owner key first (Apply now).');
      return;
    }
    setSigning(true);
    setError('');
    try {
      const payerClient = createPayerClient({ url: PAYER_URL });
      const rpcCalls = buildCalls(calls, acct.address).map((c) => ({
        to: c.to,
        value: toHex(c.value),
        data: c.data,
      }));
      const terms = await payerClient.getTerms({
        chainId: toHex(chain.id || 84538453),
        from: acct.address,
        calls: rpcCalls,
        gasLimit: toHex(BigInt(gasEstimate || 200_000)),
        context: { flow: 'transact' },
      });

      let selToken: Address | undefined;
      if (gasMode === 'usdv') {
        const tokenOffer = terms.options.find(isTokenOffer);
        selToken = tokenOffer?.tokens?.[0]?.token;
        if (!selToken) throw new Error('This payer does not accept USDV gas payment.');
      }
      const declinedFree = gasMode === 'free' ? terms.options.find(isDeclinedOffer) : undefined;
      const { option, tokenChoice } = selectPaymentOption(terms, selToken ? { token: selToken } : {});

      let phase0: { to: Address; data: Hex }[] | undefined;
      let gasNote: string;
      if (option.kind === 'token' && tokenChoice) {
        const amount = BigInt(tokenChoice.paymentAmount);
        const transfer = encodeTokenTransfer({
          token: tokenChoice.token,
          to: tokenChoice.feeRecipient ?? option.payer,
          amount,
        });
        phase0 = [{ to: transfer.to, data: transfer.data }];
        const human = `${formatUnits(amount, tokenChoice.decimals)} ${tokenChoice.symbol}`;
        gasNote =
          declinedFree && isDeclinedOffer(declinedFree)
            ? `Free sponsorship spent — paid ${human} gas · co-signed by payer`
            : `Paid ${human} gas · co-signed by payer`;
      } else {
        gasNote = 'Sponsored by vibenet payer · free grant';
      }

      const bundle = pendingBundleFor(
        txIsSession ? { mode: 'session-send', sessionId: activeSessionKey?.id } : { mode: 'owner-send' },
      );
      const presigned = bundle.map((i) => i.change);
      const installs = bundle.flatMap((i) => (i.installCall ? [i.installCall] : []));
      const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : null;
      const extra = sendExtraChanges();
      const { serialized, nextSeq } = await signComposed(
        acct,
        txSigner,
        calls,
        presigned,
        changeSeq,
        metadataHex,
        sessionPolicy,
        installs,
        { address: option.payer, phase0 },
      );
      const cosigned = await payerClient.signTransaction({
        signedTransaction: serialized,
        context: { flow: 'transact' },
      });
      const finalTx = (cosigned.signedTransaction ?? serialized) as Hex;

      let txHash: Hex;
      let pending = false;
      try {
        txHash = await broadcast8130(finalTx, setSubmitStatus);
      } catch (err) {
        if (err instanceof TxPendingError) {
          txHash = err.txHash;
          pending = true;
        } else throw err;
      }
      if (!pending) applyLandedBundle(acct, nextSeq, bundle);
      recordResult(acct, finalTx, txHash, pending, txSigner, gasNote, extra);
    } catch (err) {
      const e = err as { message?: string; name?: string };
      const msg = e.message ?? String(err);
      setError(
        e.name === 'NotAllowedError'
          ? 'Signature was dismissed.'
          : /fetch|ECONNREFUSED|network/i.test(msg)
            ? `Couldn't reach the payer service at ${PAYER_URL}.`
            : msg,
      );
    } finally {
      setSigning(false);
      setSubmitStatus('');
    }
  };

  const confirmSend = async () => {
    setReviewOpen(false);
    await (gasMode === 'eth' ? doSignNative() : doSponsoredSign());
  };

  // --- calls editor handlers ---------------------------------------------
  const clearResult = () => setResult(null);
  const setRow = (id: string, patch: Partial<CallRow>) => {
    setCalls((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    clearResult();
  };
  const addRow = (partial?: Partial<CallRow>) => {
    setCalls((prev) => [...prev, newCallRow(partial)]);
    clearResult();
  };
  const addEthRow = () => addRow({ phase: 1 });
  const resolveUsdvAddress = async (): Promise<Address | null> => {
    const status = await vibenetApi.faucet.status().catch(() => null);
    const a = status?.usdv_address;
    return a && isAddressStr(a) ? (a as Address) : null;
  };
  const addUsdvRow = async () => {
    const USDV = (await resolveUsdvAddress()) ?? '0x9A676e781A523b5d0C0e43731313A708CB607508';
    const PLACEHOLDER = '0x0000000000000000000000000000000000000001';
    addRow({ to: USDV, data: encodeUsdvTransfer(PLACEHOLDER, 1_000_000n), phase: 1 });
  };
  const removeRow = (id: string) => {
    setCalls((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
    clearResult();
  };
  const switchRowToUsdv = async (id: string) => {
    const USDV = (await resolveUsdvAddress()) ?? '0x9A676e781A523b5d0C0e43731313A708CB607508';
    const PLACEHOLDER = '0x0000000000000000000000000000000000000001';
    setRow(id, { to: USDV, data: encodeUsdvTransfer(PLACEHOLDER, 1_000_000n), value: '0' });
  };
  const switchRowToEth = (id: string) => {
    setUsdvRecipientDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    setUsdvAmountDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    setRow(id, { to: '', data: '0x', value: '0' });
  };

  const startSend = () => {
    if (!callsValid || !txSigner) return;
    setError('');
    setResult(null);
    setReviewOpen(true);
  };

  // --- owner changes -----------------------------------------------------
  const invalidateSignedChange = () => setSignedChange(null);
  const discardOwnerChanges = () => {
    setSignedChange(null);
    if (!acct) return;
    setOwnerDraft(acct.owners.map((o) => o.signerId));
    setScopeDraft(Object.fromEntries(acct.owners.map((o) => [o.signerId, o.scope ?? 0])));
  };
  const stageAddOwner = (id: string) => {
    setOwnerDraft((prev) => (prev.includes(id) ? prev : [...prev, id]));
    invalidateSignedChange();
  };
  const stageRemoveOwner = (id: string, eoaSelf: boolean) => {
    if (
      eoaSelf &&
      !window.confirm(
        "Revoke the EOA's own key? The EOA will no longer be able to sign for this account — make sure another owner is authorized first.",
      )
    )
      return;
    setOwnerDraft((prev) => prev.filter((x) => x !== id));
    invalidateSignedChange();
  };
  const setOwnerScope = (id: string, scope: number) => {
    setScopeDraft((prev) => ({ ...prev, [id]: scope }));
    invalidateSignedChange();
  };
  const mintOwner = async (kind: SignerKind) => {
    const s = await createSigner(kind);
    if (s) {
      setOwnerDraft((prev) => [...prev, s.id]);
      invalidateSignedChange();
    }
  };

  const buildAuthorizeActions = (): { actorId: Hex; authenticator: Address; scope: number }[] => [
    ...pendingAuthorize.map((s) => ({
      actorId: s.actorId,
      authenticator: s.authenticator,
      scope: scopeDraft[s.id] ?? 0,
    })),
    ...pendingScope.map((o) => ({ actorId: o.actorId, authenticator: o.authenticator, scope: o.toScope })),
  ];
  const applyOwnerUpdate = (a: StoredAccount): StoredActor[] => {
    const kept = a.owners
      .filter((o) => ownerDraft.includes(o.signerId))
      .map((o) => ({ ...o, scope: scopeDraft[o.signerId] ?? o.scope ?? 0 }));
    const added = pendingAuthorize.map((s) => ({ ...toStoredActor(s), scope: scopeDraft[s.id] ?? 0 }));
    return [...kept, ...added];
  };

  // Sign the owner change on its own (a current owner authorizes it). Captures
  // the signed blob; it then rides the next Transact or an explicit "Apply now".
  const signOwnerChange = async () => {
    if (!acct || keyChangeCount === 0) return;
    const changeWS = configChangeSigner ?? activeSigner;
    if (!changeWS) return;
    setApplying(true);
    setError('');
    try {
      const changeSigner = await buildSigner(changeWS);
      const changeAccount = nativeAccountFor(acct, changeSigner, changeWS.authenticator);
      const chainId = chain.id || 84532;
      let liveSeq: number | null = null;
      if (acct.deployed) liveSeq = await fetchOnChainConfigSeq(changeAccount.address as Address);
      const seqOffset = pendingChangeCount({ includeOwner: false });
      const nextSeq =
        (!acct.deployed && acct.type === 'eoa' ? 0 : liveSeq != null ? liveSeq : acct.configSeq + 1) +
        seqOffset;
      const change = await changeAccount.change(
        [
          ...buildAuthorizeActions().map((s) =>
            s.scope
              ? authorizeActor({ actorId: s.actorId, authenticator: s.authenticator }, { scope: s.scope })
              : authorizeActor({ actorId: s.actorId, authenticator: s.authenticator }),
          ),
          ...pendingRevoke.map((o) => revokeActor(o.actorId)),
        ],
        { chainId, sequence: nextSeq },
      );
      setSignedChange({
        accountId: acct.id,
        change,
        sequence: nextSeq,
        resultingOwners: applyOwnerUpdate(acct),
        summary: [
          ...pendingAuthorize.map((s) => `authorize ${s.label}`),
          ...pendingRevoke.map((o) => `revoke ${o.label}`),
          ...pendingScope.map((o) => `scope ${o.label} → ${scopeLabel(o.toScope)}`),
        ],
      });
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      setApplying(false);
    }
  };

  // Apply an already-signed owner change now: a post-change owner signs a no-op
  // tx that carries it.
  const applyOwnerNow = async () => {
    if (!acct || !signedChange || signedChange.accountId !== acct.id) return;
    const txWS =
      postChangeOwnerSigners.find((s) => s.id === activeSignerId) ??
      postChangeOwnerSigners[0] ??
      activeSigner;
    if (!txWS) return;
    const bundle = pendingBundleFor({ mode: 'owner-send' });
    if (!bundle.some((i) => !i.sessionId)) {
      setError(
        'A pending session key is ahead in the config sequence. Apply or discard it first, then apply the owner change.',
      );
      return;
    }
    const presigned = bundle.map((i) => i.change);
    const installs = bundle.flatMap((i) => (i.installCall ? [i.installCall] : []));
    const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : signedChange.sequence;
    const summary = signedChange.summary;
    setApplying(true);
    setError('');
    setConfigTx(null);
    try {
      const { serialized, nextSeq } = await signComposed(
        acct,
        txWS,
        [newCallRow()],
        presigned,
        changeSeq,
        undefined,
        undefined,
        installs,
        undefined,
      );
      const txHash = await broadcast8130(serialized, setSubmitStatus);
      applyLandedBundle(acct, nextSeq, bundle);
      setConfigTx({ hash: txHash, label: 'Owner change' });
      pushActivity({
        kind: 'transact',
        title: 'Key changes landed onchain',
        txHash,
        changes: summary,
        network: chain.name,
        mode: chain.mode,
        serialized,
        account: acct.address,
      });
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      setApplying(false);
      setSubmitStatus('');
    }
  };

  // --- session keys ------------------------------------------------------
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

  const patchLimit = (id: string, patch: Partial<LimitDraft>) =>
    setSkLimits((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLimit = () => setSkLimits((ls) => [...ls, newLimitDraft()]);
  const removeLimit = (id: string) => setSkLimits((ls) => ls.filter((l) => l.id !== id));
  const patchScope = (id: string, patch: Partial<ScopeDraft>) =>
    setSkScopes((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addScope = () => setSkScopes((ss) => [...ss, newScopeDraft()]);
  const removeScope = (id: string) => setSkScopes((ss) => ss.filter((s) => s.id !== id));
  const toggleScopeSelector = (id: string, sel: Hex) =>
    setSkScopes((ss) =>
      ss.map((s) => {
        if (s.id !== id) return s;
        const selectors = s.selectors.includes(sel)
          ? s.selectors.filter((x) => x !== sel)
          : [...s.selectors, sel];
        return { ...s, selectors, all: selectors.length === 0 };
      }),
    );
  const setScopeAll = (id: string) =>
    setSkScopes((ss) => ss.map((s) => (s.id === id ? { ...s, all: true, selectors: [] } : s)));

  // Mint the owner-signed authorization for a session key. `defer` captures it
  // without broadcasting — the key installs on its first transaction (or via
  // "Apply now"). Returns the stored key.
  const doAuthorizeSession = async (
    target: WalletSigner,
    opts: {
      expirySecs: number;
      policyLabel: string;
      spec: PolicySpec;
      label: string;
      chainShort: string;
      // `true` (default): capture the owner-signed authorization and install on
      // the key's first use. `false`: sign an immediate authorize+install tx now
      // (the caller broadcasts the returned `serialized`).
      defer?: boolean;
    },
  ): Promise<AppSessionKey | null> => {
    const defer = opts.defer ?? true;
    if (!acct || !activeSigner) return null;
    const skChain = getDemoChain(opts.chainShort);
    const ownerSigner = await buildSigner(activeSigner);
    const account = nativeAccountFor(acct, ownerSigner, activeSigner.authenticator);
    const scope = SCOPE.sender;
    const expiry = opts.expirySecs ? BigInt(Math.floor(Date.now() / 1000) + opts.expirySecs) : 0n;

    if (!skChain.deployment.policies)
      throw new Error(`Session policies are not available on ${skChain.name}.`);
    const { config, summary, limits } = await buildSessionConfig(opts.spec, skChain.shortName);
    const policyConfig = encodeSessionPolicyConfig(config);
    const session = defineSessionPolicy({
      account: account.address,
      policy: skChain.deployment.policies.sessionPolicy,
      policyConfig,
      manager: skChain.deployment.policies.manager,
      validUntil: expiry,
    });
    const actorPolicy = session.actorPolicy;
    const call = session.installCall(target.actorId);
    const installCall = { to: call.to, value: call.value ?? 0n, data: (call.data ?? '0x') as Hex };
    const policy: AppPolicy = {
      type: session.actorPolicy.type,
      label: opts.policyLabel,
      manager: session.manager,
      policy: session.policy,
      policyConfig,
      commitment: session.commitment,
      params: summary,
      limits,
    };

    const chainId = skChain.id || 84532;
    let liveSeqSk: number | null = null;
    if (acct.deployed) liveSeqSk = await fetchOnChainConfigSeq(account.address as Address);
    const seqOffset = pendingChangeCount();
    const nextSeq =
      (!acct.deployed && acct.type === 'eoa' ? 0 : liveSeqSk != null ? liveSeqSk : acct.configSeq + 1) +
      seqOffset;

    // Register the manager as a trusted-executor actor on first use so its
    // executeBatch callback into the account succeeds (skip if already trusted).
    const configChanges = [
      authorizeActor(
        { actorId: target.actorId, authenticator: target.authenticator },
        { scope, expiry, policy: actorPolicy },
      ),
    ];
    let registeredManager = false;
    const managerTrusted = acct.sessionKeys.some(
      (sk) => sk.policy?.manager?.toLowerCase() === policy.manager.toLowerCase(),
    );
    if (!managerTrusted) {
      configChanges.unshift(authorizeActor(key.trustedExecutor(policy.manager), { scope: SCOPE.sender }));
      registeredManager = true;
    }
    const accountChanges: AaAccountChange[] = [];
    if (!acct.deployed) accountChanges.push(firstDeployChange(acct, account));
    const configChange = await account.change(configChanges, { chainId, sequence: nextSeq });
    accountChanges.push(configChange);

    // Defer: hold the owner-signed authorization on the key; it installs on the
    // key's first transaction (or via "Apply now"). Nothing is broadcast now.
    if (defer) {
      const deferredKey: AppSessionKey = {
        id: crypto.randomUUID(),
        signerId: target.id,
        label: opts.label,
        kind: target.kind,
        actorId: target.actorId,
        authenticator: target.authenticator,
        scope,
        expiry,
        chainId,
        policy,
        createdAt: Date.now(),
        pendingAuth: { change: configChange, sequence: nextSeq, registeredManager, installCall },
      };
      updateAccount(acct.id, (a) => ({ ...a, sessionKeys: [...a.sessionKeys, deferredKey] }));
      pushActivity({
        kind: 'session',
        title: `Session key staged · ${opts.label}`,
        detail: scopeChips(scope).join(' · '),
        changes: [
          `authorize ${opts.label}`,
          ...(registeredManager ? ['register manager as external caller'] : []),
          `policy: ${policy.label}`,
          'installs on first use',
          expiry ? formatExpiry(expiry) : 'no expiry',
        ],
        network: skChain.name,
        mode: skChain.mode,
        account: acct.address,
      });
      return deferredKey;
    }

    // Immediate: sign the authorize + install tx now (owner-signed). The install
    // runs as phase-0 call 0 before any use; the caller broadcasts `serialized`.
    const wire = encodeWalletCalls({ account: account.address, calls: [[installCall]] });
    let nonceSeqSk: bigint;
    try {
      nonceSeqSk = await getTransactionCount8130(makeRpcClient(), {
        address: account.address as Address,
        nonceKey: 0n,
      });
    } catch {
      nonceSeqSk = acct.deployed ? 1n : 0n;
    }
    const skSenderAuthVerifier: Address =
      activeSigner.kind === 'p256'
        ? canonicalAuthenticators.p256
        : activeSigner.kind === 'passkey'
          ? canonicalAuthenticators.passkey
          : canonicalAuthenticators.k1;
    let skGas = 400_000n;
    if (chain.mode === 'eip8130-native') {
      try {
        const estimated = await estimateGas8130(makeRpcClient(), {
          sender: account.address as Address,
          accountChanges,
          calls: [[installCall]],
          nonceSequence: Number(nonceSeqSk),
          senderAuthVerifier: skSenderAuthVerifier,
        });
        skGas = safeGasLimit(
          estimated,
          estimateTxGas({
            mode: chain.mode,
            deploy: !acct.deployed,
            calls: 1,
            keyChanges: accountChanges.filter((c) => c.type === 'config').length,
          }),
        );
      } catch {
        skGas = 400_000n;
      }
    }
    const serialized = await account.signTransaction({
      chainId,
      accountChanges,
      calls: wire,
      metadata: toHex(`authorize:${opts.label}`),
      nonceKey: 0n,
      nonceSequence: nonceSeqSk,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
      gas: skGas,
    });
    const sk: AppSessionKey = {
      id: crypto.randomUUID(),
      signerId: target.id,
      label: opts.label,
      kind: target.kind,
      actorId: target.actorId,
      authenticator: target.authenticator,
      scope,
      expiry,
      chainId,
      policy,
      createdAt: Date.now(),
      serialized,
    };
    updateAccount(acct.id, (a) => ({
      ...a,
      deployed: true,
      configSeq: nextSeq,
      sessionKeys: [...a.sessionKeys, sk],
    }));
    pushActivity({
      kind: 'session',
      title: `Session key authorized · ${opts.label}`,
      detail: scopeChips(scope).join(' · '),
      changes: [
        `authorize ${opts.label}`,
        ...(registeredManager ? ['register manager as external caller'] : []),
        `policy: ${policy.label}`,
        `install ${short(policy.commitment, 6, 4)}`,
        expiry ? formatExpiry(expiry) : 'no expiry',
      ],
      network: skChain.name,
      mode: skChain.mode,
      serialized,
      account: acct.address,
    });
    return sk;
  };

  const registerSessionKey = async () => {
    if (!acct || !activeSigner) return;
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
      setSessionAdding(false);
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      setSkBusy(false);
    }
  };

  // Apply a staged session key now: an owner signs a no-op tx carrying its
  // authorize + install (plus lower-sequence prerequisites).
  const applySessionKeyNow = async (skId: string) => {
    if (!acct || !activeSigner) return;
    const sk = acct.sessionKeys.find((x) => x.id === skId);
    if (!sk || !sk.pendingAuth) return;
    const txWS =
      postChangeOwnerSigners.find((s) => s.id === activeSignerId) ??
      postChangeOwnerSigners[0] ??
      activeSigner;
    const bundle = pendingBundleFor({ mode: 'session-send', sessionId: sk.id });
    const presigned = bundle.map((i) => i.change);
    const installs = bundle.flatMap((i) => (i.installCall ? [i.installCall] : []));
    const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : sk.pendingAuth.sequence;
    setSkApplyingId(sk.id);
    setError('');
    try {
      const { serialized, nextSeq } = await signComposed(
        acct,
        txWS,
        [newCallRow()],
        presigned,
        changeSeq,
        undefined,
        undefined,
        installs,
        undefined,
      );
      const txHash = await broadcast8130(serialized, setSubmitStatus);
      applyLandedBundle(acct, nextSeq, bundle);
      setConfigTx({ hash: txHash, label: `Session key: ${sk.label}` });
      pushActivity({
        kind: 'session',
        title: `Session key installed · ${sk.label}`,
        detail: scopeChips(sk.scope).join(' · '),
        changes: [`authorize ${sk.label}`, ...(sk.policy ? [`policy: ${sk.policy.label}`, 'install'] : [])],
        network: chain.name,
        mode: chain.mode,
        txHash,
        serialized,
        account: acct.address,
      });
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      setSkApplyingId(null);
      setSubmitStatus('');
    }
  };

  const revokeSessionKey = (id: string) => {
    if (!acct) return;
    const sk = acct.sessionKeys.find((x) => x.id === id);
    updateAccount(acct.id, (a) => ({ ...a, sessionKeys: a.sessionKeys.filter((x) => x.id !== id) }));
    if (sk)
      pushActivity({
        kind: 'revoke',
        title: sk.pendingAuth ? `Session key discarded · ${sk.label}` : `Session key revoked · ${sk.label}`,
        detail: scopeChips(sk.scope).join(' · '),
        account: acct.address,
      });
  };

  // --- sub-accounts ------------------------------------------------------
  // Mint a dedicated app key (a K1 signer added to the demo key store).
  const mintAppKey = (label: string): WalletSigner | null => {
    const pk = generatePrivateKey();
    const owner = privateKeyToAccount(pk);
    const a = key.k1(owner.address);
    if (signers.some((s) => s.actorId === a.actorId)) return null;
    const ws: WalletSigner = {
      id: crypto.randomUUID(),
      kind: 'k1',
      label,
      privateKey: pk,
      address: owner.address,
      actorId: a.actorId,
      authenticator: a.authenticator,
    };
    setSigners((prev) => [...prev, ws]);
    return ws;
  };

  // Derive + store a delegated sub-account (its own address, controlled by this
  // account via key.delegate). `withSpareKey` also mints a fresh owner key you
  // hold, so you can spend from the sub-account without your main keys.
  const doCreateSubAccount = (label: string, opts?: { withSpareKey?: boolean }): AppSubAccount | null => {
    if (!acct) return null;
    const subSalt = randomHex32() as Hex;
    const actors = [key.delegate(acct.address)];
    const signerIds: string[] = [];
    let spare: WalletSigner | null = null;
    if (opts?.withSpareKey) {
      spare = mintAppKey(`${label.trim() || 'Spending account'} key`);
      if (spare?.address) {
        actors.push(key.k1(spare.address));
        signerIds.push(spare.id);
      }
    }
    const initialActors = sortActors(actors);
    const subAddress = computeAddress8130({
      userSalt: subSalt,
      code,
      initialActors,
      accountConfigAddress: chain.deployment.accountConfiguration,
    });
    const sub: AppSubAccount = {
      id: crypto.randomUUID(),
      label: label.trim() || `Sub-account ${acct.subAccounts.length + 1}`,
      salt: subSalt,
      address: subAddress,
      signerIds,
      delegateTo: acct.address,
      createdAt: Date.now(),
    };
    updateAccount(acct.id, (a) => ({ ...a, subAccounts: [...a.subAccounts, sub] }));
    pushActivity({
      kind: 'subaccount',
      title: `Sub-account created · ${sub.label}`,
      detail: `delegates to ${short(acct.address)}`,
      changes: ['owner: this account', ...(spare ? [`owner: ${spare.label}`] : [])],
      account: subAddress,
    });
    return sub;
  };

  const createSubAccount = () => {
    if (!acct) return;
    setSaBusy(true);
    setError('');
    try {
      doCreateSubAccount(saLabel);
      setSaLabel('');
    } catch (err) {
      setError((err as { message?: string }).message ?? String(err));
    } finally {
      setSaBusy(false);
    }
  };

  // --- apps directory ----------------------------------------------------
  const sessionKeyFor = (name: string) => acct?.sessionKeys.find((sk) => sk.label === name);
  const subAccountFor = (name: string) => acct?.subAccounts.find((sa) => sa.label === name);

  // Connect a session-key app: mint a dedicated key, authorize it with the app's
  // policy (owner-signed, immediate), and broadcast so it's bound on-chain.
  const connectSessionApp = async (app: DemoApp) => {
    if (!acct || !activeSigner) return;
    setAppBusy(app.id);
    setError('');
    try {
      const target = mintAppKey(app.name);
      if (!target) {
        setError("Couldn't mint an app key — try again.");
        return;
      }
      const expirySecs = EXPIRY_PRESETS.find((p) => p.id === app.expiryId)?.seconds ?? 0;
      const sk = await doAuthorizeSession(target, {
        expirySecs,
        policyLabel: app.policyLabel ?? 'Policy',
        spec: app.spec?.(acct.address) ?? {},
        label: app.name,
        chainShort: chain.shortName,
        defer: false,
      });
      if (sk?.serialized) {
        const txHash = await broadcast8130(sk.serialized, setSubmitStatus);
        setConfigTx({ hash: txHash, label: `Connected: ${app.name}` });
      }
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      setAppBusy(null);
      setSubmitStatus('');
    }
  };

  // Connect a sub-account app ("spending account"): derive a delegated account
  // with a spare owner key you hold.
  const connectVault = (app: DemoApp) => {
    if (!acct) return;
    setAppBusy(app.id);
    setError('');
    try {
      doCreateSubAccount(app.name, { withSpareKey: true });
    } catch (err) {
      setError((err as { message?: string }).message ?? String(err));
    } finally {
      setAppBusy(null);
    }
  };

  const explorerAddrHref = acct
    ? `${VIBENET_EXPLORER_PATH}/address/${acct.address}`
    : VIBENET_EXPLORER_PATH;

  return (
    <div className="flex flex-col gap-10 pb-4 text-black dark:text-white">
      <DemoHeader
        eyebrow="EIP-8130 · Demo"
        title="Account"
        description="Create portable account-abstraction accounts from in-browser signer keys, fund them from the faucet, compose atomic batches, and broadcast native EIP-8130 transactions. Keys never leave this browser — testnet only."
        actions={
          <div className="hidden items-center gap-4 font-mono text-[12px] text-bds-gray-60 sm:flex dark:text-bds-gray-40">
            <a href={SPEC_URL} target="_blank" rel="noopener" className="hover:text-base-blue dark:hover:text-bds-blue-20">
              Spec ↗
            </a>
            <a href={CONTRACTS_URL} target="_blank" rel="noopener" className="hover:text-base-blue dark:hover:text-bds-blue-20">
              Contracts ↗
            </a>
          </div>
        }
      />

      <DemoTabs
        ariaLabel="Account demo views"
        value={view}
        onChange={(v) => setView(v as View)}
        items={[
          { value: 'account', label: 'Account' },
          { value: 'transact', label: 'Transact', disabled: !acct },
          { value: 'apps', label: 'Apps', disabled: !acct },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {view === 'account' ? renderAccount() : view === 'transact' ? renderTransact() : renderApps()}
        </div>

        <DemoKeys
          signers={signers}
          busy={busy}
          renameId={renameId}
          setRenameId={setRenameId}
          createSigner={createSigner}
          renameSigner={renameSigner}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70 [line-break:anywhere] dark:border-bds-red-80 dark:bg-bds-red-100/40 dark:text-bds-red-20"
        >
          {error}
        </p>
      ) : null}

      <ActivityLog activity={activity} />

      <CreateAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        modalType={modalType}
        setModalType={setModalType}
        modalLabel={modalLabel}
        setModalLabel={setModalLabel}
        modalSalt={modalSalt}
        setModalSalt={setModalSalt}
        modalIds={modalIds}
        setModalIds={setModalIds}
        modalEoaId={modalEoaId}
        setModalEoaId={setModalEoaId}
        signers={signers}
        eoaSigners={eoaSigners}
        modalSigners={modalSigners}
        modalAddress={modalAddress}
        busy={busy}
        createSigner={createSigner}
        createAccount={createAccount}
      />

      {/* Review + confirm (final signature step). */}
      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Review transaction"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={confirmSend}>
              Sign &amp; send
            </Button>
          </>
        }
      >
        {acct ? (
          <ReviewBody
            acct={acct}
            calls={calls}
            metaField={metaField}
            chain={chain}
            gasMode={gasMode}
            gasEstimate={gasEstimate}
            txSigner={txSigner}
          />
        ) : null}
      </Modal>

      <Modal
        open={clearConfirm}
        onClose={() => setClearConfirm(false)}
        title="Clear all accounts?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setClearConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={clearAllData} className="bg-bds-red-60 hover:bg-bds-red-70">
              Clear everything
            </Button>
          </>
        }
      >
        <Text variant="body" tone="muted">
          This removes every signer key, account, and activity entry from this browser. Onchain
          state is untouched — accounts can be recreated from the same keys and salts.
        </Text>
      </Modal>

      <Modal
        open={regenesisNotice}
        onClose={() => setRegenesisNotice(false)}
        title="Chain was reset"
        footer={
          <Button variant="primary" size="sm" onClick={() => setRegenesisNotice(false)}>
            Got it
          </Button>
        }
      >
        <Text variant="body" tone="muted">
          The vibenet devnet has been regenesised — its onchain state was wiped. Your accounts and
          keys are still here and their addresses are unchanged; they&apos;ve been marked undeployed
          and will redeploy on their next transaction.
        </Text>
      </Modal>
    </div>
  );

  // -------------------------------------------------------------------------
  // Views (closures over component state).
  // -------------------------------------------------------------------------

  function renderAccount() {
    return (
      <>
        <div className="flex items-center justify-between gap-4">
          <Text variant="title2">Accounts</Text>
          {accounts.length > 0 ? (
            <button
              type="button"
              onClick={() => setClearConfirm(true)}
              className="text-[13px] text-bds-gray-60 transition-colors hover:text-bds-red-60 dark:text-bds-gray-40"
            >
              Clear all
            </button>
          ) : null}
        </div>

        {accounts.length === 0 ? (
          <Card className="flex flex-col items-center gap-4 bg-white px-6 py-12 text-center dark:bg-white/5">
            <span className="text-[32px] leading-none text-bds-gray-30" aria-hidden="true">
              ◉
            </span>
            <Text variant="title3">No accounts yet</Text>
            <Text variant="body" tone="muted" className="max-w-sm">
              Create an account from one or more signer keys. You&apos;ll get a portable address you
              can fund and transact with anywhere.
            </Text>
            <Button onClick={openCreate}>Create account</Button>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveAccountId(a.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-4 text-left transition-colors',
                    a.id === activeAccountId
                      ? 'border-base-blue bg-bds-blue-0 dark:border-bds-blue-60 dark:bg-bds-blue-100/30'
                      : 'border-bds-gray-10 bg-white hover:border-bds-blue-30 dark:border-white/10 dark:bg-white/5 dark:hover:border-bds-blue-60',
                  )}
                >
                  <AccountDot />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-medium">{a.label}</span>
                    <code className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      {short(a.address)}
                    </code>
                  </span>
                  {a.deployed ? <Badge tone="ok">deployed</Badge> : null}
                </button>
              ))}
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-bds-gray-15 p-4 text-[14px] text-bds-gray-60 transition-colors hover:border-base-blue hover:text-base-blue dark:border-white/15 dark:text-bds-gray-40 dark:hover:border-bds-blue-60"
              >
                + New account
              </button>
            </div>

            {acct ? (
              <ConfigView
                acct={acct}
                copied={copied}
                copy={copy}
                cfgTab={cfgTab}
                setCfgTab={setCfgTab}
                explorerHref={explorerAddrHref}
                onTransact={() => setView('transact')}
                assetBals={assetBals}
                assetsLoading={assetsLoading}
                faucetBusy={faucetBusy}
                requestFaucet={requestFaucet}
                signers={signers}
                ownerDraft={ownerDraft}
                scopeDraft={scopeDraft}
                ownersEditing={ownersEditing}
                setOwnersEditing={setOwnersEditing}
                pendingAuthorize={pendingAuthorize}
                pendingRevoke={pendingRevoke}
                pendingScope={pendingScope}
                keyChangeCount={keyChangeCount}
                ownerChangeSigned={ownerChangeSigned}
                configTx={configTx}
                applying={applying}
                busy={busy}
                stageAddOwner={stageAddOwner}
                stageRemoveOwner={stageRemoveOwner}
                setOwnerScope={setOwnerScope}
                mintOwner={mintOwner}
                signOwnerChange={signOwnerChange}
                applyOwnerNow={applyOwnerNow}
                discardOwnerChanges={discardOwnerChanges}
                sessionAdding={sessionAdding}
                setSessionAdding={setSessionAdding}
                skSignerId={skSignerId}
                setSkSignerId={setSkSignerId}
                skChainShort={skChainShort}
                setSkChainShort={setSkChainShort}
                skExpiryId={skExpiryId}
                setSkExpiryId={setSkExpiryId}
                skLimits={skLimits}
                patchLimit={patchLimit}
                addLimit={addLimit}
                removeLimit={removeLimit}
                skScopes={skScopes}
                patchScope={patchScope}
                addScope={addScope}
                removeScope={removeScope}
                toggleScopeSelector={toggleScopeSelector}
                setScopeAll={setScopeAll}
                skBusy={skBusy}
                skApplyingId={skApplyingId}
                policyRemaining={policyRemaining}
                formPolicyEmpty={formPolicyEmpty}
                submitStatus={submitStatus}
                registerSessionKey={registerSessionKey}
                applySessionKeyNow={applySessionKeyNow}
                revokeSessionKey={revokeSessionKey}
                saLabel={saLabel}
                setSaLabel={setSaLabel}
                saBusy={saBusy}
                createSubAccount={createSubAccount}
              />
            ) : null}
          </>
        )}
      </>
    );
  }

  function renderApps() {
    if (!acct) return null;
    return (
      <AppsView
        acct={acct}
        chain={chain}
        apps={DEMO_APPS}
        appBusy={appBusy}
        activeSigner={activeSigner}
        signers={signers}
        copied={copied}
        copy={copy}
        networkShort={networkShort}
        setNetworkShort={setNetworkShort}
        sessionKeyFor={sessionKeyFor}
        subAccountFor={subAccountFor}
        connectSessionApp={connectSessionApp}
        connectVault={connectVault}
        revokeSessionKey={revokeSessionKey}
      />
    );
  }

  function renderTransact() {
    if (!acct) return null;
    const stableSym = balances?.usdv_symbol ?? (networkShort === 'vibenet' ? 'USDV' : 'USDC');
    return (
      <>
        <div className="flex items-center justify-between gap-4">
          <Text variant="title2">Transact</Text>
        </div>

        {/* Account + network + balances */}
        <Card className="flex flex-col gap-4 bg-white p-5 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => copy(acct.address, 'txaddr')}
              title="Copy address"
              className="flex items-center gap-2"
            >
              <AccountDot />
              <span className="text-[14px] font-medium">{acct.label}</span>
              <code className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
                {short(acct.address)}
              </code>
              <span className="text-[11px] uppercase tracking-[0.4px] text-bds-gray-50">
                {copied === 'txaddr' ? 'Copied' : ''}
              </span>
            </button>
            <div className="w-44">
              <Select
                ariaLabel="Network"
                value={networkShort}
                onValueChange={setNetworkShort}
                options={DEMO_CHAINS.map((c) => ({
                  value: c.shortName,
                  label: `${c.name} ${c.mode === 'eip8130-native' ? '· 8130' : '· 4337'}`,
                }))}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bds-gray-10 pt-4 dark:border-white/10">
            <label className="flex items-center gap-2 text-[13px]">
              <span className="text-bds-gray-60 dark:text-bds-gray-40">Sign with</span>
              {signableSigners.length > 1 ? (
                <div className="w-52">
                  <Select
                    ariaLabel="Signing key"
                    value={txSigner?.id ?? ''}
                    onValueChange={(id) => {
                      setTxSignerId(id);
                      if (ownerSigners.some((s) => s.id === id)) setActiveSignerId(id);
                    }}
                    options={postChangeOwnerSigners.map((s) => ({
                      value: s.id,
                      label: `${s.label} (${KIND_LABEL[s.kind]})${
                        ownerSigners.some((o) => o.id === s.id) ? '' : ' · pending'
                      }`,
                    }))}
                    groups={
                      sessionSigners.length > 0
                        ? [
                            {
                              label: 'Session keys',
                              options: sessionSigners.map((s) => ({
                                value: s.id,
                                label: `${s.label} (${KIND_LABEL[s.kind]}) · session`,
                              })),
                            },
                          ]
                        : []
                    }
                  />
                </div>
              ) : (
                <span className="flex items-center gap-1.5 font-medium">
                  {txSigner?.label}
                  {txSigner ? <KindBadge kind={txSigner.kind} /> : null}
                </span>
              )}
            </label>
            <div className="flex items-center gap-4">
              <span className="text-[14px]">
                <b>
                  <AnimatedAmount
                    text={balLoading ? '…' : formatEthWei(balances?.eth_wei)}
                    decimals={4}
                    group={false}
                  />
                </b>{' '}
                <small className="text-bds-gray-60 dark:text-bds-gray-40">ETH</small>
              </span>
              <span className="text-[14px]">
                <b>
                  <AnimatedAmount
                    text={balLoading ? '…' : formatUnits(balances?.usdv, balances?.usdv_decimals)}
                    decimals={2}
                    group
                  />
                </b>{' '}
                <small className="text-bds-gray-60 dark:text-bds-gray-40">{stableSym}</small>
              </span>
              {networkShort === 'vibenet' ? (
                <Button variant="secondary" size="sm" onClick={requestFaucet} disabled={faucetBusy !== null}>
                  {faucetBusy ? '…' : 'Top Up'}
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Calls editor */}
        <CallsEditor
          calls={calls}
          callsAdvanced={callsAdvanced}
          setCallsAdvanced={setCallsAdvanced}
          setRow={setRow}
          addEthRow={addEthRow}
          addUsdvRow={addUsdvRow}
          removeRow={removeRow}
          switchRowToUsdv={switchRowToUsdv}
          switchRowToEth={switchRowToEth}
          usdvRecipientDrafts={usdvRecipientDrafts}
          setUsdvRecipientDrafts={setUsdvRecipientDrafts}
          usdvAmountDrafts={usdvAmountDrafts}
          setUsdvAmountDrafts={setUsdvAmountDrafts}
          callsValid={callsValid}
          addRow={addRow}
        />

        {/* Metadata */}
        <Card className="flex flex-col gap-2 bg-white p-5 dark:bg-white/5">
          <div className="flex items-baseline justify-between gap-2">
            <Text variant="label" className="font-medium">
              Metadata
            </Text>
            <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">top-level · signed</span>
          </div>
          <input
            value={metaField}
            spellCheck={false}
            placeholder="optional note / app data — e.g. invoice #4242"
            onChange={(e) => setMetaField(e.target.value)}
            className="w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3.5 py-2.5 text-[14px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-bds-blue-60 dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40"
          />
          {metadataHex ? (
            <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
              → <code>{short(metadataHex, 14, 8)}</code>
            </p>
          ) : null}
        </Card>

        {/* Submit */}
        <Card className="flex flex-col gap-4 bg-white p-5 dark:bg-white/5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="text-bds-gray-60 dark:text-bds-gray-40">Gas</span>
              <div className="w-56">
                <Select
                  ariaLabel="Gas payment"
                  value={gasMode}
                  onValueChange={(v) => setGasMode(v as 'eth' | 'free' | 'usdv')}
                  options={[
                    { value: 'eth', label: 'Pay in ETH' },
                    { value: 'free', label: 'Free · sponsored (ERC-8168)' },
                    { value: 'usdv', label: 'USDV · ERC-8168' },
                  ]}
                />
              </div>
            </label>
            <Button onClick={startSend} disabled={!callsValid || !txSigner || signing}>
              {submitStatus === 'submitting'
                ? 'Submitting…'
                : submitStatus === 'confirming'
                  ? 'Waiting for confirmation…'
                  : 'Send transaction'}
            </Button>
          </div>
          <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
            <b>{chain.mode === 'eip8130-native' ? 'native 8130' : 'ERC-4337'}</b> · 1 tx · ~
            {gasEstimate.toLocaleString()} gas
            {!acct.deployed
              ? acct.type === 'eoa'
                ? ' · first use delegates your EOA'
                : ' · first use deploys your account'
              : ''}
          </p>

          {result ? <ResultPanel result={result} chain={chain} copied={copied} copy={copy} /> : null}
        </Card>
      </>
    );
  }
}

// ---------------------------------------------------------------------------
// Presentational sub-components.
// ---------------------------------------------------------------------------

type CallsEditorProps = {
  calls: CallRow[];
  callsAdvanced: boolean;
  setCallsAdvanced: (fn: (v: boolean) => boolean) => void;
  setRow: (id: string, patch: Partial<CallRow>) => void;
  addEthRow: () => void;
  addUsdvRow: () => void;
  removeRow: (id: string) => void;
  switchRowToUsdv: (id: string) => void;
  switchRowToEth: (id: string) => void;
  usdvRecipientDrafts: Record<string, string>;
  setUsdvRecipientDrafts: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  usdvAmountDrafts: Record<string, string>;
  setUsdvAmountDrafts: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  callsValid: boolean;
  addRow: (partial?: Partial<CallRow>) => void;
};

const INPUT_CLS =
  'w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-bds-blue-60 dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40';

function CallsEditor(props: CallsEditorProps) {
  const {
    calls,
    callsAdvanced,
    setCallsAdvanced,
    setRow,
    addEthRow,
    addUsdvRow,
    removeRow,
    switchRowToUsdv,
    switchRowToEth,
    usdvRecipientDrafts,
    setUsdvRecipientDrafts,
    usdvAmountDrafts,
    setUsdvAmountDrafts,
    callsValid,
    addRow,
  } = props;

  return (
    <Card className="flex flex-col gap-4 bg-white p-5 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <Text variant="label" className="font-medium">
            Calls
          </Text>
          <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
            {calls.length === 1 ? '1 call' : `${calls.length} calls · atomic batch`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCallsAdvanced((v) => !v)}
          className="rounded-full border border-bds-gray-10 px-3 py-1 text-[12px] text-bds-gray-60 transition-colors hover:border-bds-gray-15 dark:border-white/10 dark:text-bds-gray-40"
        >
          {callsAdvanced ? 'Simple' : 'Raw'}
        </button>
      </div>

      {!callsAdvanced ? (
        <>
          <ul className="flex flex-col gap-3">
            {calls.map((r, i) => {
              const usdv = tryDecodeUsdvTransfer(r);
              if (usdv) {
                const amtDisplay = usdvAmountDrafts[r.id] ?? formatUnits(usdv.amount, USDV_DECIMALS);
                const recipientDisplay = usdvRecipientDrafts[r.id] ?? usdv.recipient;
                return (
                  <li key={r.id} className="flex items-end gap-2">
                    <span className="pb-2 text-[12px] text-bds-gray-50">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => switchRowToEth(r.id)}
                      title="Switch to ETH send"
                      className="mb-0.5 shrink-0 rounded-md border border-bds-purple-15 bg-bds-purple-0 px-2 py-2 text-[12px] font-medium text-bds-purple-70 dark:border-bds-purple-80 dark:bg-bds-purple-100/40 dark:text-bds-purple-20"
                    >
                      USDV ⇄
                    </button>
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-[11px] text-bds-gray-60 dark:text-bds-gray-40">Recipient</span>
                      <input
                        className={INPUT_CLS}
                        value={recipientDisplay}
                        spellCheck={false}
                        placeholder="0x…"
                        onChange={(e) => {
                          const val = e.target.value;
                          setUsdvRecipientDrafts((d) => ({ ...d, [r.id]: val }));
                          if (isAddressStr(val)) {
                            try {
                              setRow(r.id, { data: encodeUsdvTransfer(val, usdv.amount) });
                            } catch {
                              /* ignore */
                            }
                          }
                        }}
                      />
                    </label>
                    <label className="flex w-28 flex-col gap-1">
                      <span className="text-[11px] text-bds-gray-60 dark:text-bds-gray-40">USDV</span>
                      <input
                        className={INPUT_CLS}
                        value={amtDisplay}
                        spellCheck={false}
                        inputMode="decimal"
                        placeholder="0"
                        onChange={(e) => {
                          const val = e.target.value;
                          setUsdvAmountDrafts((d) => ({ ...d, [r.id]: val }));
                          try {
                            const amt = parseUnits(val || '0', USDV_DECIMALS);
                            const rec = isAddressStr(recipientDisplay) ? recipientDisplay : usdv.recipient;
                            setRow(r.id, { data: encodeUsdvTransfer(rec, amt) });
                          } catch {
                            /* ignore */
                          }
                        }}
                        onBlur={() =>
                          setUsdvAmountDrafts((d) => {
                            const n = { ...d };
                            delete n[r.id];
                            return n;
                          })
                        }
                      />
                    </label>
                    <RemoveRowButton onClick={() => removeRow(r.id)} disabled={calls.length === 1} />
                  </li>
                );
              }
              return (
                <li key={r.id} className="flex items-end gap-2">
                  <span className="pb-2 text-[12px] text-bds-gray-50">{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => switchRowToUsdv(r.id)}
                    title="Switch to USDV send"
                    className="mb-0.5 shrink-0 rounded-md border border-bds-gray-10 px-2 py-2 text-[12px] font-medium text-bds-gray-70 dark:border-white/10 dark:text-bds-gray-20"
                  >
                    ETH ⇄
                  </button>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-[11px] text-bds-gray-60 dark:text-bds-gray-40">To</span>
                    <input
                      className={INPUT_CLS}
                      value={r.to}
                      spellCheck={false}
                      placeholder="0x… recipient address"
                      onChange={(e) => setRow(r.id, { to: e.target.value })}
                    />
                  </label>
                  <label className="flex w-28 flex-col gap-1">
                    <span className="text-[11px] text-bds-gray-60 dark:text-bds-gray-40">ETH</span>
                    <input
                      className={INPUT_CLS}
                      value={r.value}
                      spellCheck={false}
                      inputMode="decimal"
                      placeholder="0.0"
                      onChange={(e) => setRow(r.id, { value: e.target.value })}
                    />
                  </label>
                  <RemoveRowButton onClick={() => removeRow(r.id)} disabled={calls.length === 1} />
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Add call:</span>
            <Button variant="outline" size="sm" onClick={addEthRow}>
              + Send ETH
            </Button>
            <Button variant="outline" size="sm" onClick={addUsdvRow}>
              + Send USDV
            </Button>
          </div>
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            <li
              className="hidden items-center gap-2 px-1 text-[11px] uppercase tracking-[0.4px] text-bds-gray-50 sm:flex"
              aria-hidden="true"
            >
              <span className="w-5" />
              <span className="w-12">Phase</span>
              <span className="flex-1">Send to</span>
              <span className="w-24">ETH</span>
              <span className="flex-1">Calldata (hex)</span>
              <span className="w-7" />
            </li>
            {calls.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <span className="w-5 text-[12px] text-bds-gray-50">{i + 1}</span>
                <button
                  type="button"
                  onClick={() => setRow(r.id, { phase: r.phase === 0 ? 1 : 0 })}
                  title={
                    r.phase === 0
                      ? 'Phase 0 — runs before phase 1 (click to move to phase 1)'
                      : 'Phase 1 — main user calls (click to move to phase 0)'
                  }
                  className={cn(
                    'w-12 shrink-0 rounded-md border py-2 text-[12px] font-medium',
                    r.phase === 0
                      ? 'border-bds-orange-20 bg-bds-orange-0 text-bds-orange-70 dark:border-bds-orange-80 dark:bg-bds-orange-100/40 dark:text-bds-orange-20'
                      : 'border-bds-gray-10 text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40',
                  )}
                >
                  {r.phase === 0 ? 'pre' : '1'}
                </button>
                <input
                  className={cn(INPUT_CLS, 'flex-1')}
                  value={r.to}
                  spellCheck={false}
                  placeholder="contract / address"
                  onChange={(e) => setRow(r.id, { to: e.target.value })}
                />
                <input
                  className={cn(INPUT_CLS, 'w-24')}
                  value={r.value}
                  spellCheck={false}
                  inputMode="decimal"
                  placeholder="0.0"
                  onChange={(e) => setRow(r.id, { value: e.target.value })}
                />
                <input
                  className={cn(INPUT_CLS, 'flex-1 font-mono')}
                  value={r.data}
                  spellCheck={false}
                  placeholder="0x"
                  onChange={(e) => setRow(r.id, { data: e.target.value })}
                />
                <RemoveRowButton onClick={() => removeRow(r.id)} disabled={calls.length === 1} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => addRow()}>
              + Add call
            </Button>
            {!callsValid ? (
              <span className="text-[12px] text-bds-red-60">
                Check call fields — “to” must be a 20-byte hex address, calldata must be hex.
              </span>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

function RemoveRowButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Remove call"
      className="mb-0.5 flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-[18px] text-bds-gray-50 transition-colors hover:text-bds-red-60 disabled:cursor-not-allowed disabled:opacity-30"
    >
      ×
    </button>
  );
}

type ReviewBodyProps = {
  acct: StoredAccount;
  calls: CallRow[];
  metaField: string;
  chain: DemoChain;
  gasMode: 'eth' | 'free' | 'usdv';
  gasEstimate: number;
  txSigner: WalletSigner | null;
};

function ReviewBody({ acct, calls, metaField, chain, gasMode, gasEstimate, txSigner }: ReviewBodyProps) {
  const gasLabel =
    gasMode === 'eth' ? 'Pay in ETH' : gasMode === 'free' ? 'Free · sponsored' : 'USDV · payer';
  return (
    <div className="flex flex-col gap-4">
      {!acct.deployed ? (
        <div className="flex items-start gap-2 rounded-lg border border-bds-blue-15 bg-bds-blue-0 p-3 text-[13px] dark:border-bds-blue-80 dark:bg-bds-blue-100/30">
          <Badge>{acct.type === 'eoa' ? 'delegate' : 'deploy'}</Badge>
          <span className="text-bds-gray-70 dark:text-bds-gray-20">
            {acct.type === 'eoa'
              ? 'First use — this also delegates your EOA to the account contract.'
              : 'First use — this also deploys your account on-chain.'}
          </span>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {calls.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bds-gray-10 text-[11px] dark:bg-white/10">
              {i + 1}
            </span>
            <code className="text-bds-gray-70 dark:text-bds-gray-20">
              {short(r.to.trim() || acct.address)}
            </code>
            {r.value.trim() && r.value.trim() !== '0' ? (
              <span className="font-medium">{r.value} ETH</span>
            ) : null}
            {r.data.trim() && r.data.trim() !== '0x' ? (
              <span className="font-mono text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                {short(r.data.trim(), 8, 4)}
              </span>
            ) : null}
          </li>
        ))}
        {metaField.trim() ? (
          <li className="flex items-center gap-2 text-[13px]">
            <Badge>meta</Badge>
            {metaField.trim()}
          </li>
        ) : null}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bds-gray-10 pt-3 text-[13px] dark:border-white/10">
        <span className="text-bds-gray-60 dark:text-bds-gray-40">
          <b className="text-black dark:text-white">
            {chain.mode === 'eip8130-native' ? 'native 8130' : 'ERC-4337'}
          </b>{' '}
          · 1 tx · ~{gasEstimate.toLocaleString()} gas · {gasLabel}
        </span>
        {txSigner ? (
          <span className="flex items-center gap-1.5">
            <span className="text-bds-gray-60 dark:text-bds-gray-40">signing</span>
            <KindBadge kind={txSigner.kind} />
            <span className="font-medium">{txSigner.label}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

type ResultPanelProps = {
  result: {
    serialized?: Hex;
    txHash?: Hex;
    by: string;
    kind: SignerKind;
    gasNote?: string;
    pending?: boolean;
  };
  chain: DemoChain;
  copied: string | null;
  copy: (text: string, k: string) => void;
};

function ResultPanel({ result, chain, copied, copy }: ResultPanelProps) {
  const native = chain.mode === 'eip8130-native';
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-bds-gray-10 bg-bds-gray-0 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={result.pending ? 'warn' : 'ok'}>
          {result.txHash
            ? result.pending
              ? '⏳ pending · not yet included'
              : '✓ landed onchain'
            : '✓ signed in-browser'}
        </Badge>
        <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          by {result.by} ({KIND_LABEL[result.kind]})
        </span>
      </div>
      {result.gasNote ? (
        <div className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{result.gasNote}</div>
      ) : null}
      {result.txHash ? (
        <a
          href={native ? `${VIBENET_EXPLORER_PATH}/tx/${result.txHash}` : basescanTx(result.txHash)}
          target={native ? undefined : '_blank'}
          rel="noopener"
          className="flex items-center gap-2 font-mono text-[13px] text-base-blue hover:underline dark:text-bds-blue-20"
        >
          <code>{short(result.txHash, 16, 12)}</code>
          <span className="text-[11px] uppercase tracking-[0.4px]">
            {native ? 'Explorer ↗' : 'Basescan ↗'}
          </span>
        </a>
      ) : result.serialized ? (
        <button
          type="button"
          onClick={() => copy(result.serialized as string, 'res')}
          className="flex items-center gap-2 text-left font-mono text-[13px] text-base-blue dark:text-bds-blue-20"
        >
          <code>{short(result.serialized, 16, 12)}</code>
          <span className="text-[11px] uppercase tracking-[0.4px]">
            {copied === 'res' ? 'Copied' : 'copy raw tx'}
          </span>
        </button>
      ) : null}
    </div>
  );
}

type DemoKeysProps = {
  signers: WalletSigner[];
  busy: SignerKind | null;
  renameId: string | null;
  setRenameId: (id: string | null) => void;
  createSigner: (kind: SignerKind) => Promise<WalletSigner | null>;
  renameSigner: (id: string, raw: string) => void;
};

function DemoKeys({ signers, busy, renameId, setRenameId, createSigner, renameSigner }: DemoKeysProps) {
  return (
    <Card className="flex h-fit flex-col gap-4 bg-white p-5 lg:sticky lg:top-6 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2">
        <Text variant="label" className="font-medium">
          Demo Keys
        </Text>
        <Badge>in-browser · demo</Badge>
      </div>
      <Text variant="footnote" tone="muted">
        Keys live in this browser only. Testnet demo — do not reuse these or send real assets.
      </Text>

      <div className="flex flex-wrap gap-2">
        {(['k1', 'p256', 'passkey'] as const).map((kind) => (
          <Button key={kind} variant="outline" size="sm" onClick={() => createSigner(kind)} disabled={busy !== null}>
            {busy === kind ? '…' : `+ ${KIND_LABEL[kind]}`}
          </Button>
        ))}
      </div>

      {signers.length === 0 ? (
        <Text variant="footnote" tone="muted" className="py-4 text-center">
          No signers yet. Mint a key to start.
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {signers.map((s) => (
            <li key={s.id} className="flex flex-col gap-1.5 rounded-lg border border-bds-gray-10 p-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <KindBadge kind={s.kind} />
                {renameId === s.id ? (
                  <input
                    autoFocus
                    defaultValue={s.label}
                    onBlur={(e) => renameSigner(s.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameSigner(s.id, (e.target as HTMLInputElement).value);
                      if (e.key === 'Escape') setRenameId(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-bds-gray-10 bg-bds-gray-0 px-1.5 py-0.5 text-[13px] outline-none focus:border-bds-blue-60 dark:border-white/10 dark:bg-white/5"
                  />
                ) : (
                  <button
                    type="button"
                    title="Rename key"
                    onClick={() => setRenameId(s.id)}
                    className="group flex min-w-0 flex-1 items-center gap-1 text-left text-[13px] font-medium"
                  >
                    <span className="truncate">{s.label}</span>
                    <span aria-hidden="true" className="text-bds-gray-40 opacity-0 transition-opacity group-hover:opacity-100">
                      ✎
                    </span>
                  </button>
                )}
              </div>
              <code className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                {short(signerIdentity(s))}
              </code>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type CreateAccountModalProps = {
  open: boolean;
  onClose: () => void;
  modalType: AccountType;
  setModalType: (t: AccountType) => void;
  modalLabel: string;
  setModalLabel: (v: string) => void;
  modalSalt: string;
  setModalSalt: (v: string) => void;
  modalIds: string[];
  setModalIds: (fn: (prev: string[]) => string[]) => void;
  modalEoaId: string | null;
  setModalEoaId: (id: string | null) => void;
  signers: WalletSigner[];
  eoaSigners: WalletSigner[];
  modalSigners: WalletSigner[];
  modalAddress: Address | null;
  busy: SignerKind | null;
  createSigner: (kind: SignerKind) => Promise<WalletSigner | null>;
  createAccount: () => void;
};

function CreateAccountModal(props: CreateAccountModalProps) {
  const {
    open,
    onClose,
    modalType,
    setModalType,
    modalLabel,
    setModalLabel,
    modalSalt,
    setModalSalt,
    modalIds,
    setModalIds,
    modalEoaId,
    setModalEoaId,
    signers,
    eoaSigners,
    modalSigners,
    modalAddress,
    busy,
    createSigner,
    createAccount,
  } = props;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create account"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={createAccount} disabled={!modalAddress}>
            Create account
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-2 text-[14px] font-medium">
        Label
        <input
          value={modalLabel}
          placeholder="e.g. Main account"
          onChange={(e) => setModalLabel(e.target.value)}
          className="w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3.5 py-2.5 text-[14px] font-normal outline-none transition-colors placeholder:text-bds-gray-40 focus:border-bds-blue-60 dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40"
        />
      </label>

      <div className="flex flex-col gap-2 text-[14px] font-medium">
        Account type
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['smart', 'Smart account', 'Counterfactual · keys + salt → address'],
              ['eoa', 'EOA account', 'Your EOA · delegates to DefaultAccount'],
            ] as const
          ).map(([type, title, hint]) => (
            <button
              key={type}
              type="button"
              onClick={() => setModalType(type)}
              className={cn(
                'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                modalType === type
                  ? 'border-base-blue bg-bds-blue-0 dark:border-bds-blue-60 dark:bg-bds-blue-100/30'
                  : 'border-bds-gray-10 hover:border-bds-gray-15 dark:border-white/10 dark:hover:border-white/20',
              )}
            >
              <span className="text-[14px] font-semibold">{title}</span>
              <span className="text-[12px] font-normal text-bds-gray-60 dark:text-bds-gray-40">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      {modalType === 'smart' ? (
        <>
          <KeyPicker
            heading="Initial keys"
            empty="Mint a key above to add it as an initial owner."
            signers={signers}
            busy={busy}
            mintKinds={['k1', 'p256', 'passkey']}
            isOn={(s) => modalIds.includes(s.id)}
            onToggle={(s) =>
              setModalIds((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
            }
            onMint={async (kind) => {
              const s = await createSigner(kind);
              if (s) setModalIds((prev) => [...prev, s.id]);
            }}
          />
          <label className="flex flex-col gap-2 text-[14px] font-medium">
            Salt
            <div className="flex gap-2">
              <input
                value={modalSalt}
                spellCheck={false}
                onChange={(e) => setModalSalt(e.target.value)}
                placeholder="0x… (32 bytes) or any phrase"
                className="w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3.5 py-2.5 font-mono text-[13px] font-normal outline-none transition-colors placeholder:text-bds-gray-40 focus:border-bds-blue-60 dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40"
              />
              <Button variant="outline" size="sm" onClick={() => setModalSalt(randomHex32())}>
                Randomize
              </Button>
            </div>
          </label>
        </>
      ) : (
        <KeyPicker
          heading="EOA key"
          empty="Mint a K1 key — its address becomes the account."
          hint="Your EOA is the account. Its key stays a full owner and it delegates to DefaultAccount on first use. Runs on Vibenet (native 8130)."
          signers={eoaSigners}
          busy={busy}
          mintKinds={['k1']}
          isOn={(s) => modalEoaId === s.id}
          onToggle={(s) => setModalEoaId(modalEoaId === s.id ? null : s.id)}
          onMint={async (kind) => {
            const s = await createSigner(kind);
            if (s) setModalEoaId(s.id);
          }}
        />
      )}

      <div className="flex flex-col gap-1 rounded-lg border border-bds-gray-10 bg-bds-gray-0 p-3 dark:border-white/10 dark:bg-white/5">
        <span className="text-[11px] uppercase tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
          Address
        </span>
        {modalAddress ? (
          <code className="break-all font-mono text-[13px] text-base-blue dark:text-bds-blue-20">
            {modalAddress}
          </code>
        ) : modalType === 'eoa' ? (
          <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">pick a K1 key</span>
        ) : modalSigners.length === 0 ? (
          <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">select at least one key</span>
        ) : (
          <span className="text-[13px] text-bds-red-60">duplicate key — pick distinct actors</span>
        )}
      </div>
    </Modal>
  );
}

type KeyPickerProps = {
  heading: string;
  empty: string;
  hint?: string;
  signers: WalletSigner[];
  busy: SignerKind | null;
  mintKinds: readonly SignerKind[];
  isOn: (s: WalletSigner) => boolean;
  onToggle: (s: WalletSigner) => void;
  onMint: (kind: SignerKind) => void;
};

function KeyPicker({ heading, empty, hint, signers, busy, mintKinds, isOn, onToggle, onMint }: KeyPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Text variant="label" className="font-medium">
          {heading}
        </Text>
        <div className="flex gap-2">
          {mintKinds.map((kind) => (
            <Button key={kind} variant="outline" size="sm" onClick={() => onMint(kind)} disabled={busy !== null}>
              + {KIND_LABEL[kind]}
            </Button>
          ))}
        </div>
      </div>
      {signers.length === 0 ? (
        <Text variant="footnote" tone="muted" className="py-2">
          {empty}
        </Text>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {signers.map((s) => {
            const on = isOn(s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onToggle(s)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition-colors',
                    on
                      ? 'border-base-blue bg-bds-blue-0 dark:border-bds-blue-60 dark:bg-bds-blue-100/30'
                      : 'border-bds-gray-10 hover:border-bds-gray-15 dark:border-white/10 dark:hover:border-white/20',
                  )}
                >
                  <KindBadge kind={s.kind} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.label}</span>
                  <code className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                    {short(signerIdentity(s))}
                  </code>
                  <span className="w-4 text-center text-base-blue dark:text-bds-blue-20">{on ? '✓' : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hint ? (
        <Text variant="footnote" tone="muted">
          {hint}
        </Text>
      ) : null}
    </div>
  );
}
