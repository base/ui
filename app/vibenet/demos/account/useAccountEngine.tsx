'use client';

// The EIP-8130 account engine shared by every vibenet demo that transacts from
// local accounts (Account demo, B20, …): chain/network resolution, signer +
// account CRUD, owner / session-key / sub-account management, and the
// underlying native-8130 signing/broadcast primitives. Extracted from
// AccountDemo.tsx so other demos (B20) get the exact same create/delete/
// details capability instead of a stripped-down local reimplementation.
//
// Demo-specific UI (the Transact modal's calls builder, gas-mode picker, Apps
// directory orchestration) stays in each demo and calls into this engine's
// shared primitives (signComposed, pendingBundleFor, applyLandedBundle,
// broadcast8130) exactly as AccountDemo's own transact flow does — those
// primitives are used by both config-apply and transact sends, so they have to
// live in one place, not two. Error and config-sequence-recovery UI is owned by
// the Transact modal, not the engine, so nothing surfaces on the page behind it.

import {
  type AaAccountChange,
  type Address,
  authorizeActor,
  canonicalAuthenticators,
  computeAddress,
  createPublicClient,
  createWebAuthnCredential,
  defineSessionPolicy,
  delegateAuthSize,
  ecrecoverAuthenticator,
  type Eip8130Deployment,
  encodeSessionPolicyConfig,
  encodeTokenTransfer,
  encodeWalletCalls,
  estimateGas,
  generatePrivateKey,
  getConfigSequence,
  getTransactionCount,
  type Hex,
  http,
  key,
  privateKeyToAccount,
  revokeActor,
  sessionPolicyAbi,
  type Signer,
  toAccount,
  toDelegateSigner,
  toEoaAccount,
  toHex,
  toP256Signer,
  toWebAuthnAccount,
  toWebAuthnSigner,
  upgradeableProxyBytecode,
  waitForTransactionReceipt,
} from '@aa';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { vibenetApi } from '../../library/client';
import { ACCOUNT_RPC_URL } from '../../library/config';
import { type DemoChain, deploymentFromContracts, estimateTxGas, getDemoChain } from './library/chains';
import { buildPhases, type CallRow, newCallRow, safeGasLimit, valueBearingCallCount } from './library/calls';
import {
  type AppPolicy,
  type AppSessionKey,
  type AppSubAccount,
  formatExpiry,
  SCOPE,
  scopeChips,
  type SignerKind,
  type StoredAccount,
  type StoredActor,
} from './library/model';
import {
  buildSessionConfig,
  type PolicySpec,
  resolveStable,
  scopeLabel,
  wrapSessionCalls,
  ZERO_ADDR,
} from './library/policy';
import {
  type Balances,
  KIND_LABEL,
  type Persisted,
  short,
  type WalletSigner,
} from './shared';
import { actorPairs, randomHex32, sortActors, toStoredActor } from './library/derive';
import { useAccounts } from './useAccounts';

const fundAccount = (address: Address) =>
  Promise.all([
    vibenetApi.faucet.drip({ address }),
    vibenetApi.faucet.dripUsdv({ address }),
  ]);

/** Fold a landed batch of session-key config changes into the key list:
 *  - a key whose staged REVOKE landed is removed entirely, and
 *  - a key whose staged AUTHORIZE landed has its `pendingAuth` cleared.
 *  `landedIds` are the session ids whose changes rode the confirmed tx. */
function commitLandedSessions(a: StoredAccount, landedIds: Set<string>): AppSessionKey[] {
  return a.sessionKeys
    .filter((sk) => !(landedIds.has(sk.id) && sk.pendingRevoke))
    .map((sk) => (landedIds.has(sk.id) && sk.pendingAuth ? { ...sk, pendingAuth: undefined } : sk));
}

/** Add a PolicyManager address to the trusted-executor set (dedup, case-insensitive). */
function mergeManagerAddr(existing: readonly Address[] | undefined, add: Address): Address[] {
  const list = existing ? [...existing] : [];
  return list.some((m) => m.toLowerCase() === add.toLowerCase()) ? list : [...list, add];
}

/** After deferred session keys land, fold any managers they registered
 *  (`pendingAuth.registeredManager`) into `trustedManagers`, so a later authorize
 *  won't try to re-register an already-present manager (which reverts). The manager
 *  is intentionally never removed on revoke — other keys may share it. */
function mergeLandedManagers(a: StoredAccount, landedIds: Set<string>): Address[] | undefined {
  let out = a.trustedManagers;
  for (const sk of a.sessionKeys)
    if (landedIds.has(sk.id) && sk.pendingAuth?.registeredManager && sk.policy?.manager)
      out = mergeManagerAddr(out, sk.policy.manager);
  return out;
}

/** Best-effort human reason from a viem/RPC error (unwraps the "Missing or invalid
 *  parameters" boilerplate to the underlying details). */
function estimateFailureReason(err: unknown): string {
  const e = err as {
    shortMessage?: string;
    details?: string;
    message?: string;
    cause?: { shortMessage?: string; message?: string };
  };
  if (e && typeof e === 'object') {
    const short = e.shortMessage?.trim();
    const generic = short && /^Missing or invalid parameters/i.test(short);
    return (
      (generic ? e.details : short) ??
      e.details ??
      short ??
      e.cause?.shortMessage ??
      e.cause?.message ??
      e.message ??
      String(err)
    );
  }
  return String(err);
}

/** True when an error is an EIP-8130 config-change sequence mismatch: a staged
 *  change's sequence went stale (the on-chain counter advanced since it was signed)
 *  so it can never land as-is and must be re-signed at the current sequence — or
 *  dropped. */
export function isSeqMismatch(err: unknown): boolean {
  const s = `${estimateFailureReason(err)} ${err instanceof Error ? err.message : String(err)}`;
  return /config change sequence mismatch/i.test(s);
}

/** Collapse a giant viem error dump to its `Details:` line (or first line) for display. */
export function conciseError(message: string): string {
  const detail = message.match(/Details:\s*([\s\S]*?)(?:\s*Version:\s|$)/);
  if (detail?.[1]?.trim()) return detail[1].trim();
  const firstLine = message
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return firstLine ?? message;
}

/** True when a gas-estimate error means the node simply lacks the EIP-8130
 *  `eth_estimateGas` extension — the ONE case where silently falling back to the
 *  structural floor is still correct. Any OTHER estimate revert now indicates the
 *  tx would actually fail (the node can simulate session-key + policy bundles once
 *  `senderActorId` is supplied), so it must be surfaced rather than swallowed. */
function isUnsupportedRpcError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: number;
    message?: string;
    shortMessage?: string;
    details?: string;
    cause?: { code?: number; message?: string };
  };
  if (e.code === -32601 || e.cause?.code === -32601) return true;
  const text = [e.message, e.shortMessage, e.details, e.cause?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    text.includes('method not found') ||
    text.includes('not whitelisted') ||
    text.includes('does not exist') ||
    text.includes('unsupported method') ||
    text.includes('method not supported')
  );
}

// ---------------------------------------------------------------------------
// Module-scope helpers.
// ---------------------------------------------------------------------------

function localConfigSequence(local: bigint, bootstrap: AaAccountChange | undefined): bigint {
  return bootstrap?.type === 'create' ? 1n : local;
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
export class TxPendingError extends Error {
  readonly txHash: Hex;
  constructor(hash: Hex) {
    super(`Transaction is pending — not yet included (${hash}).`);
    this.txHash = hash;
  }
}

/** Thrown when transaction composition is configured to stop on a reverting
 * gas estimate instead of silently broadcasting with a fallback gas limit. */
export class EstimateRevertedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Gas estimate failed — this transaction would revert: ${reason}`);
    this.reason = reason;
  }
}

type PendingChangeItem = {
  change: AaAccountChange;
  sequence: number;
  sessionId?: string;
  resultingOwners?: StoredActor[];
};

// ---------------------------------------------------------------------------

function useAccountEngineCore() {
  const {
    signers,
    setSigners,
    accounts,
    setAccounts,
    activeAccountId,
    setActiveAccountId,
    activity,
    setActivity,
    networkShort,
    setNetworkShort,
    genesisHash,
    setGenesisHash,
    hydrated,
    addAccount,
    deleteAccount,
  } = useAccounts();

  const [busy, setBusy] = useState<SignerKind | null>(null);

  const [activeSignerId, setActiveSignerId] = useState<string | null>(null);

  const [faucetBusy, setFaucetBusy] = useState<string | null>(null);

  // Regenesis (devnet reset) detection.
  const [regenesisNotice, setRegenesisNotice] = useState(false);

  // Owner-change staging (draft owners vs applied owners).
  const [ownerDraft, setOwnerDraft] = useState<string[]>([]);
  const [scopeDraft, setScopeDraft] = useState<Record<string, number>>({});
  const [signedChange, setSignedChange] = useState<SignedOwnerChange | null>(null);
  const [applying, setApplying] = useState(false);

  // Session-key apply state (the authorize/revoke form lives in SessionKeyEditor).
  const [skApplyingId, setSkApplyingId] = useState<string | null>(null);
  const [policyRemaining, setPolicyRemaining] = useState<
    Record<
      string,
      Record<string, { remaining: bigint; allowance: bigint; symbol: string; decimals: number; period: number }>
    >
  >({});

  // EIP-8130 system-contract addresses, resolved live from the dataplane so a
  // devnet reset (which redeploys them to new addresses) never needs a code
  // change. `null` until the first fetch lands → the static fallback in
  // chains.ts is used. See the fetch effect below.
  const [liveDeployment, setLiveDeployment] = useState<Eip8130Deployment | null>(null);
  // Overlay the live deployment onto a demo chain (vibenet only — Base Sepolia
  // is a persistent testnet whose canonical addresses don't move).
  const resolveChain = useCallback(
    (short: string): DemoChain => {
      const base = getDemoChain(short);
      return liveDeployment && base.shortName === 'vibenet'
        ? { ...base, deployment: liveDeployment }
        : base;
    },
    [liveDeployment],
  );

  const chain = useMemo(() => resolveChain(networkShort), [resolveChain, networkShort]);
  // Proxy code for a smart account. MUST target a DEPLOYED implementation: with a
  // codeless impl, policy-gated session-key sends route PolicyManager.execute ->
  // account.executeBatch into empty code — the tx "succeeds", the policy consumes
  // its spend counter, `PolicyExecuted` fires, yet no funds move.
  //
  // `accounts.upgradeable` (UpgradeableAccount) was removed from the canonical
  // eip-8130 deploy and is NOT deployed on the devnet, which caused exactly that
  // failure. Use `accounts.default` (deployed DefaultAccount).
  const code = useMemo(() => upgradeableProxyBytecode(chain.deployment.accounts.default), [chain]);

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

  // --- regenesis detection ----------------------------------------------
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const checkGenesis = async () => {
      let hash: string | null = null;
      try {
        const block = await makeRpcClient().getBlock({ blockNumber: 0n });
        hash = block.hash ?? null;
      } catch {
        return;
      }
      if (!hash || cancelled) return;
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
  }, [hydrated, makeRpcClient, setAccounts, setGenesisHash]);

  // --- live EIP-8130 deployment resolution ------------------------------
  // Fetch the system-contract addresses from the dataplane on mount and again
  // whenever a reset is detected (`genesisHash` changes). This is what makes the
  // demo survive an arbitrary devnet reset with no code change. Keeps the same
  // object identity when addresses are unchanged so `chain`/`code`/rpc-client
  // memos don't churn.
  useEffect(() => {
    const controller = new AbortController();
    vibenetApi
      .contracts(controller.signal)
      .then((contracts) => {
        const next = deploymentFromContracts(contracts);
        if (!next) return; // malformed payload → keep static fallback
        setLiveDeployment((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      })
      .catch(() => {
        /* offline / aborted → keep last-known-good deployment */
      });
    return () => controller.abort();
  }, [genesisHash]);

  const acct = useMemo(() => accounts.find((a) => a.id === activeAccountId) ?? null, [accounts, activeAccountId]);
  const addressBook = useMemo(
    () => accounts.map((a) => ({ label: a.label, address: a.address })),
    [accounts],
  );

  // Owner signers for the active account. A sub-account is controlled by its
  // parent (via key.delegate), so key selection resolves to the parent's owner
  // signers — plus any direct owners the sub holds itself (e.g. a minted spare key).
  const ownerSigners = useMemo(() => {
    if (!acct) return [] as WalletSigner[];
    const parent = acct.parentId ? (accounts.find((a) => a.id === acct.parentId) ?? null) : null;
    const ownerIds = new Set<string>();
    for (const o of acct.owners) if (o.signerId) ownerIds.add(o.signerId);
    if (parent) for (const o of parent.owners) if (o.signerId) ownerIds.add(o.signerId);
    return signers.filter((s) => ownerIds.has(s.id));
  }, [acct, accounts, signers]);
  const activeSigner = ownerSigners.find((s) => s.id === activeSignerId) ?? ownerSigners[0] ?? null;

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
    return signers.filter((s) => ownerDraft.includes(s.id) && !acct.owners.some((o) => o.signerId === s.id));
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

  // A current owner able to authorize config changes (must be valid *before* the
  // change). Prefer the tx signer when it's already a current owner — callers
  // that have a concept of a "tx signer" (e.g. AccountDemo's Transact flow) pass
  // it in; engine-internal callers pass `null`.
  const configChangeSignerFor = useCallback(
    (txSigner: WalletSigner | null): WalletSigner | null => {
      if (keyChangeCount === 0) return null;
      if (txSigner && ownerSigners.some((s) => s.id === txSigner.id)) return txSigner;
      return ownerSigners.find((s) => s.id === activeSignerId) ?? ownerSigners[0] ?? null;
    },
    [keyChangeCount, ownerSigners, activeSignerId],
  );
  const configChangeSigner = useMemo(() => configChangeSignerFor(null), [configChangeSignerFor]);

  // Which staged changes ride an outgoing tx. Owner sends never install a
  // session policy; session sends carry that key's authorize+install (plus any
  // lower-sequence prerequisites for continuity).
  const pendingChanges = useMemo<PendingChangeItem[]>(() => {
    if (!acct) return [];
    const items: PendingChangeItem[] = [];
    if (signedChange && signedChange.accountId === acct.id)
      items.push({
        change: signedChange.change,
        sequence: signedChange.sequence,
        resultingOwners: signedChange.resultingOwners,
      });
    for (const sk of acct.sessionKeys) {
      if (sk.pendingAuth)
        items.push({ change: sk.pendingAuth.change, sequence: sk.pendingAuth.sequence, sessionId: sk.id });
      // A staged revoke is a local-counter change too — carry it like an
      // authorization so it rides a session send / apply-all.
      if (sk.pendingRevoke)
        items.push({ change: sk.pendingRevoke.change, sequence: sk.pendingRevoke.sequence, sessionId: sk.id });
    }
    return items.sort((a, b) => a.sequence - b.sequence);
  }, [acct, signedChange]);

  const pendingBundleFor = (opts: { mode: 'owner-send' | 'session-send' | 'apply-all'; sessionId?: string }): PendingChangeItem[] => {
    if (opts.mode === 'apply-all') return pendingChanges;
    if (opts.mode === 'owner-send')
      return pendingChanges.filter(
        (i) => !i.sessionId && !pendingChanges.some((s) => s.sessionId && s.sequence < i.sequence),
      );
    const active = pendingChanges.find((i) => i.sessionId === opts.sessionId);
    if (!active) return pendingChanges.filter((i) => !i.sessionId);
    return pendingChanges.filter((i) => i.sequence <= active.sequence);
  };

  const pendingSessionChangeCount = () =>
    (acct?.sessionKeys ?? []).filter((sk) => sk.pendingAuth || sk.pendingRevoke).length;

  // Re-sync owner draft + config-related state when the active account changes.
  // Form-local state (the transact modal, the session-key editor) resets in the
  // component that owns it, since this core has no notion of those forms.
  useEffect(() => {
    setOwnerDraft(acct ? acct.owners.map((o) => o.signerId) : []);
    setScopeDraft(acct ? Object.fromEntries(acct.owners.map((o) => [o.signerId, o.scope ?? 0])) : {});
    setActiveSignerId(acct ? (acct.owners[0]?.signerId ?? null) : null);
    setSignedChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

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
    const keys = acct.sessionKeys.filter((sk) => !sk.pendingAuth && sk.policy?.commitment && sk.policy.policy);
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
        if (!meta.has(ZERO_ADDR.toLowerCase())) meta.set(ZERO_ADDR.toLowerCase(), { symbol: 'ETH', decimals: 18 });
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
  const pushActivity = (e: Omit<Persisted['activity'][number], 'id' | 'ts'>) =>
    setActivity((prev) => [{ id: crypto.randomUUID(), ts: Date.now(), ...e }, ...prev]);

  const updateAccount = useCallback(
    (id: string, patch: Partial<StoredAccount> | ((a: StoredAccount) => StoredAccount)) =>
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? (typeof patch === 'function' ? patch(a) : { ...a, ...patch }) : a)),
      ),
    [setAccounts],
  );

  const refreshVibenetBalances = async (): Promise<Balances | null> => {
    if (!acct) return null;
    return vibenetApi.account.balances(acct.address, 'vibenet').catch(() => null);
  };

  const requestFaucet = async () => {
    if (!acct) return;
    setFaucetBusy('eth+usdv');
    try {
      // Capture the pre-drip balance as the baseline for the "did it credit?" poll.
      const before = await refreshVibenetBalances();
      const ethBefore = BigInt(before?.eth_wei ?? '0');
      await fundAccount(acct.address);
      const deadline = Date.now() + 8_000;
      let credited = false;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        const fresh = await refreshVibenetBalances();
        if (BigInt(fresh?.eth_wei ?? '0') > ethBefore) {
          credited = true;
          break;
        }
      }
      if (credited) {
        toast.success('Topped up successfully');
      } else {
        toast.error("Top up didn't go through — Vibenet may be down for maintenance. Please try again shortly.");
      }
    } catch {
      toast.error('Top up failed');
    } finally {
      setFaucetBusy(null);
    }
  };

  const autoFundNewAccount = (address: Address) => {
    void fundAccount(address)
      .then(() => toast.success('New account funded from the faucet'))
      .catch(() => toast.error('Auto top-up failed — use Top Up to retry'));
  };

  const createSigner = async (kind: SignerKind): Promise<WalletSigner | null> => {
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
        toast.error('That key is already in your wallet (same actor). Skipped.');
        return null;
      }
      setSigners((prev) => [...prev, ws]);
      return ws;
    } catch (err) {
      const e = err as { message?: string; name?: string };
      toast.error(e.name === 'NotAllowedError' ? 'Passkey prompt was dismissed.' : (e.message ?? String(err)));
      return null;
    } finally {
      setBusy(null);
    }
  };

  // Signer ids referenced by any account — as an owner, a session key, or a
  // sub-account owner. Keys outside this set are unused and safe to delete.
  const usedSignerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of accounts) {
      for (const o of a.owners) ids.add(o.signerId);
      for (const o of a.initialActors) ids.add(o.signerId);
      for (const sk of a.sessionKeys) ids.add(sk.signerId);
      for (const sub of a.subAccounts) for (const id of sub.signerIds) ids.add(id);
    }
    return ids;
  }, [accounts]);

  // Drop an unused wallet key. The create modal owns its own selection state, so
  // it clears any reference to a just-deleted key itself.
  const deleteSigner = useCallback(
    (id: string) => {
      if (usedSignerIds.has(id)) return;
      setSigners((prev) => prev.filter((s) => s.id !== id));
    },
    [usedSignerIds, setSigners],
  );

  // --- 8130 account handle + first-deploy change -------------------------
  const nativeAccountFor = (a: StoredAccount, signer: Signer, authenticator: Address) => {
    const isDefaultEoaActor =
      a.type === 'eoa' &&
      authenticator === ecrecoverAuthenticator &&
      !!signer.address &&
      signer.address.toLowerCase() === a.address.toLowerCase();
    if (isDefaultEoaActor) return toEoaAccount(signer);
    if (a.type === 'eoa') {
      return toAccount({ signer, address: a.address as Address, authenticator });
    }
    // Sub-account controlled by a parent via `key.delegate(parent)`. When the
    // selected signer is NOT one of the sub's own direct owners (e.g. a minted
    // spare key), it must be a PARENT admin owner vouching through the
    // DelegateAuthenticator. Wrap it so the senderAuth is the delegate blob
    // (DELEGATE || parent || nestedAuthenticator || nestedSignature) instead of a
    // plain [ecrecover||sig], which the node rejects with "actor is not bound"
    // (the parent's k1 actorId is not an actor on the sub — only the delegate is).
    if (a.parentId) {
      const parent = accounts.find((p) => p.id === a.parentId) ?? null;
      const selfActorId = key.k1(signer.address as Address).actorId.toLowerCase();
      const isDirectOwner = a.initialActors.some(
        (o) =>
          o.actorId.toLowerCase() === selfActorId &&
          (o.authenticator ?? ecrecoverAuthenticator).toLowerCase() === ecrecoverAuthenticator.toLowerCase(),
      );
      if (parent && !isDirectOwner) {
        const delegateSigner = toDelegateSigner({
          delegateAccount: parent.address as Address,
          nestedSigner: signer,
          nestedAuthenticator: authenticator,
        });
        return toAccount({
          signer: delegateSigner,
          authenticator: delegateSigner.authenticator,
          userSalt: a.salt,
          code,
          initialActors: sortActors(actorPairs(a.initialActors)),
        });
      }
    }
    return toAccount({
      signer,
      userSalt: a.salt,
      code,
      initialActors: sortActors(actorPairs(a.initialActors)),
      authenticator,
    });
  };

  const firstDeployChange = (a: StoredAccount, account: ReturnType<typeof nativeAccountFor>): AaAccountChange =>
    a.type === 'eoa'
      ? account.delegate(a.delegate ?? chain.deployment.accounts.default)
      : (account as ReturnType<typeof toAccount>).create();

  // Wait for a broadcast tx to be included and check that it — and every 8130
  // phase in it — succeeded. Throws TxPendingError if it is still not included
  // when the timeout runs out, a plain Error if anything reverted.
  const awaitInclusion = async (txHash: Hex, timeout = 30_000): Promise<Hex> => {
    try {
      const receipt = await waitForTransactionReceipt(makeRpcClient() as never, { hash: txHash, timeout });
      if (receipt.status === '0x0') throw new Error(`Transaction reverted onchain (${txHash}).`);
      const phases = receipt.eip8130?.phaseStatuses ?? [];
      const failedPhase = phases.findIndex((s: Hex) => s === '0x0');
      if (failedPhase !== -1) throw new Error(`Phase ${failedPhase} reverted (tx ${txHash}).`);
    } catch (err) {
      if ((err as Error)?.message?.includes('timed out')) throw new TxPendingError(txHash);
      throw err;
    }
    return txHash;
  };

  // Broadcast a signed 8130 tx and wait for inclusion. Throws TxPendingError on
  // timeout (submitted but unconfirmed), a plain Error if any phase reverts.
  const broadcast8130 = async (signedTx: Hex, onStatus?: (s: 'submitting' | 'confirming') => void): Promise<Hex> => {
    const client = makeRpcClient();
    onStatus?.('submitting');
    const txHash = (await client.request({
      method: 'eth_sendRawTransaction',
      params: [signedTx],
    })) as Hex;
    onStatus?.('confirming');
    return awaitInclusion(txHash);
  };

  // Live EIP-8130 state used while preparing a transaction. This is the only
  // source of truth for deployment and config sequences; the persisted
  // `deployed` / `configSeq` fields are display caches and are never consulted
  // while signing.
  //
  // Reads the account's two config-change counters:
  //   - `multichain` (configChainId 0) — carries OWNER (actor) changes, so they
  //     sequence independently of session-key authorizes.
  //   - `local` (per-chain) — carries session-key authorizes.
  // Keeping them on separate counters means a pending session key can't shift an
  // owner change's sequence (or vice versa) — the classic "config change sequence
  // mismatch". Never guess a live sequence (a wrong value reverts on-chain): on a
  // read failure we THROW so the caller aborts signing instead of using a guess.
  const fetchOnChainAccountState = async (
    address: Address,
  ): Promise<{ deployed: boolean; local: bigint; multichain: bigint }> => {
    try {
      const client = makeRpcClient();
      const [codeAt, { local, multichain }] = await Promise.all([
        client.request({
          method: 'eth_getCode',
          params: [address as `0x${string}`, 'latest'],
        }),
        getConfigSequence(client, { account: address }),
      ]);
      return { deployed: !!codeAt && codeAt !== '0x', local, multichain };
    } catch (err) {
      const reason = (err as { message?: string })?.message ?? String(err);
      throw new Error(
        `Couldn't read the on-chain EIP-8130 state for ${address}: ${reason}. Not signing with cached state.`,
      );
    }
  };

  // Compose + sign a native EIP-8130 transaction: first-use deploy change,
  // any pre-signed owner/session config changes (carried in sequence order),
  // optional payer pre-calls, and the user calls (wrapped through the
  // PolicyManager when a session key signs — every execute carries the full
  // committed binding, so there is no separate install phase). Returns the
  // signed tx + the config sequence it advances to.
  const signComposed = async (
    a: StoredAccount,
    signerWS: WalletSigner,
    rows: CallRow[],
    presignedChanges: AaAccountChange[],
    changeSeq: number | null,
    meta: Hex | undefined,
    sessionPolicy?: AppPolicy,
    // `localSigner` co-signs `payerAuth` inline with a key this browser holds
    // (the B20 demo's own faucet-funded payer EOA, which accepts an arbitrary
    // B20 stablecoin as the fee). Without it the tx is serialized with an empty
    // `payerAuth` for a hosted payer service to co-sign out of band.
    payerOpt?: { address: Address; phase0?: { to: Address; data: Hex }[]; localSigner?: Signer },
    // Set by callers that run several transactions back to back. The public RPC
    // is served by replicas whose heads can differ, so re-reading the nonce (or
    // probing for code) between two sends can answer from a replica that hasn't
    // seen the previous one yet. Such a caller reads both once up front and
    // pins them here instead.
    seqOpt?: {
      nonceSequence?: bigint;
      assumeDeployed?: boolean;
      estimateRevert?: 'fallback' | 'throw' | 'force';
    },
  ): Promise<{ serialized: Hex; nextSeq: number }> => {
    const signer = await buildSigner(signerWS);
    const account = nativeAccountFor(a, signer, signerWS.authenticator);
    const chainId = chain.id || 84532;
    const accountChanges: AaAccountChange[] = [];
    const nextSeq = changeSeq ?? 0;

    // Sub-account signed via the parent's delegate actor? Then the acting actor
    // (for estimation) is the delegate, not the parent owner's own k1 actor — and
    // its senderAuth is the longer delegate blob. Detect it the same way
    // nativeAccountFor does (parent owner, not a direct sub owner).
    const parentAcct = a.parentId ? (accounts.find((p) => p.id === a.parentId) ?? null) : null;
    const isDirectSubOwner =
      !!a.parentId &&
      a.initialActors.some(
        (o) =>
          o.actorId.toLowerCase() === signerWS.actorId.toLowerCase() &&
          (o.authenticator ?? ecrecoverAuthenticator).toLowerCase() === ecrecoverAuthenticator.toLowerCase(),
      );
    const isDelegateSub = !!parentAcct && !isDirectSubOwner;

    // Resolve deployment + both config counters once at the composition
    // boundary. Lower-level signing never consults the persisted account flags.
    // A caller running several transactions back to back pins the deployment
    // state instead: an earlier transaction in that run already deployed the
    // account, and a code probe can still lag it and wrongly re-attach the
    // create change.
    const effectivelyDeployed =
      seqOpt?.assumeDeployed ?? (await fetchOnChainAccountState(account.address as Address)).deployed;
    const bootstrapChange = effectivelyDeployed ? undefined : firstDeployChange(a, account);
    if (bootstrapChange) accountChanges.push(bootstrapChange);
    if (effectivelyDeployed !== a.deployed) updateAccount(a.id, { deployed: effectivelyDeployed });
    accountChanges.push(...presignedChanges);

    const { phase0: userPhase0, phase1: userPhase1 } = buildPhases(rows, account.address);
    const phases: { to: Address; value?: bigint; data?: Hex }[][] = [];
    if (sessionPolicy) {
      // A gated session key may only reach the PolicyManager, so wrap every user
      // call as `PolicyManager.execute` (each execute carries the full committed
      // binding — no install phase). Any payer USDV payment is also wrapped.
      const sessionPhase0: { to: Address; value?: bigint; data?: Hex }[] = [];
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
      // [payerPreCalls?, userPhase0?, userPhase1]
      if (payerOpt?.phase0 && payerOpt.phase0.length > 0)
        phases.push(payerOpt.phase0.map((c) => ({ to: c.to, value: 0n, data: c.data })));
      if (userPhase0.length > 0) phases.push(userPhase0);
      phases.push(userPhase1);
    }

    // Structural gas-floor accounting: wrapped session calls are "heavy"
    // (PolicyManager frames + first-use SSTOREs); everything else plain.
    const totalCalls = phases.reduce((n, p) => n + p.length, 0);
    const heavyCallCount = sessionPolicy ? userPhase0.length + userPhase1.length : 0;
    const plainCallCount = Math.max(totalCalls - heavyCallCount, 1);
    const wire = encodeWalletCalls({ account: account.address, calls: phases });

    const nonceSequence =
      seqOpt?.nonceSequence ??
      (await getTransactionCount(makeRpcClient(), {
        address: account.address as Address,
        nonceKey: 0n,
      }));

    // Authenticator hint so estimateGas shapes the senderAuth stub for the
    // actual signer. A delegate-signed sub-account acts via the parent's delegate
    // actor, whose senderAuth is the longer delegate blob — hint the delegate
    // authenticator.
    const senderAuthAuthenticator: Address = isDelegateSub
      ? canonicalAuthenticators.delegate
      : signerWS.kind === 'p256'
        ? canonicalAuthenticators.p256
        : signerWS.kind === 'passkey'
          ? canonicalAuthenticators.passkey
          : canonicalAuthenticators.k1;
    const senderActorId: Hex =
      isDelegateSub && parentAcct ? key.delegate(parentAcct.address as Address).actorId : signerWS.actorId;

    // Structural gas floor. `false` = realistic-with-headroom (a floor UNDER a
    // successful node estimate). `true` = 2x over-provision (used when no node
    // estimate is available, so a heavy policy/payer send can't under-provision
    // and OOG-revert — unused gas is refunded).
    const floorGas = (fallback = false) =>
      estimateTxGas({
        mode: chain.mode,
        deploy: !effectivelyDeployed,
        calls: plainCallCount,
        keyChanges: accountChanges.filter((c) => c.type === 'config').length,
        policyCalls: heavyCallCount,
        // Value-bearing user calls carry the stipend + cold-account cost the node
        // estimate misses (policy-wrapped sends still forward the ETH value).
        valueCalls: valueBearingCallCount(rows),
        fallback,
      });
    let gasLimit: bigint;
    if (chain.mode === 'eip8130-native') {
      try {
        const estimated = await estimateGas(makeRpcClient(), {
          sender: account.address as Address,
          // Name the acting actor so the node can fully simulate the tx —
          // policy-gated session keys (resolving the actor's scope + PolicyManager
          // binding) and payer (ERC-8168) bundles. Without it the node falls back
          // to the account's self actor and mis-prices or reverts those shapes,
          // which under-provisions a session send and OOG-reverts on-chain.
          senderActorId,
          accountChanges,
          calls: phases,
          nonceSequence: Number(nonceSequence),
          senderAuthAuthenticator,
          // The delegate authenticator has no fixed default auth-payload length,
          // so hand the estimator the exact senderAuth size (delegate blob).
          ...(isDelegateSub ? { senderAuthSize: delegateAuthSize() } : {}),
          ...(payerOpt ? { payer: payerOpt.address } : {}),
        });
        gasLimit = safeGasLimit(estimated, floorGas(false));
      } catch (err) {
        // With `senderActorId` supplied the node CAN simulate session-key/policy/
        // payer bundles, so a failed estimate now generally means the tx would
        // actually revert. Only a few shapes are benign and fall back to the floor:
        if (isUnsupportedRpcError(err)) {
          // Node lacks the 8130 `eth_estimateGas` extension — floor is still correct.
          gasLimit = BigInt(floorGas(true) || 200_000);
        } else if (!effectivelyDeployed) {
          // A tx carrying `create` can't be simulated (account doesn't exist yet;
          // the node rejects with -32602) — but the create binds actors and lands.
          gasLimit = BigInt(floorGas(true) || 200_000);
        } else if (isDelegateSub) {
          // Delegate sub-account: the nested (parent) vouch through the
          // DelegateAuthenticator is a shape the node's estimator may not simulate,
          // but a broadcast still lands — fall back to the generous floor.
          gasLimit = BigInt(floorGas(true) || 200_000);
        } else if (seqOpt?.estimateRevert === 'force') {
          // User chose "Send anyway": price at a high ceiling so an under-estimate
          // isn't the cause of a revert. If it still reverts, it's a genuine logic
          // failure and the gas is spent (self-pay) / rejected (payer).
          gasLimit = BigInt(Math.max(floorGas(true) * 2, 2_000_000));
        } else if (seqOpt?.estimateRevert === 'throw') {
          // Genuine reverting estimate on a Transact send — surface it instead of
          // broadcasting a doomed tx. The Transact view shows a "Send anyway" hatch.
          throw new EstimateRevertedError(estimateFailureReason(err));
        } else {
          // Non-transact caller (config apply flows) — keep the over-provisioned
          // floor so a genuine revert surfaces via the normal on-chain error path.
          gasLimit = BigInt(floorGas(true) || 200_000);
        }
      }
    } else {
      gasLimit = BigInt(floorGas(true) || 200_000);
    }

    const serialized = await account.signTransaction(
      {
        chainId,
        accountChanges,
        calls: wire,
        metadata: meta,
        nonceKey: 0n,
        nonceSequence,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 1_000_000n,
        gas: gasLimit,
        // A local payer signs `payerAuth` here, so don't stub it out.
        ...(payerOpt ? { payer: payerOpt.address, ...(payerOpt.localSigner ? {} : { payerAuth: '0x' as Hex }) } : {}),
      },
      payerOpt?.localSigner ? { payer: { account: payerOpt.localSigner, address: payerOpt.address } } : undefined,
    );
    return { serialized, nextSeq };
  };

  // Apply the on-chain effects a landed tx carried: mark deployed, advance the
  // config sequence, apply a bundled owner change, clear bundled keys' pendingAuth,
  // remove keys whose staged revoke landed, and record any newly-trusted managers.
  const applyLandedBundle = (a: StoredAccount, nextSeq: number, bundle: PendingChangeItem[]) => {
    const ownerItem = bundle.find((i) => i.resultingOwners);
    const bundledSessionIds = new Set(bundle.flatMap((i) => (i.sessionId ? [i.sessionId] : [])));
    const newOwners = ownerItem?.resultingOwners ?? a.owners;
    updateAccount(a.id, (acc) => ({
      ...acc,
      deployed: true,
      configSeq: nextSeq,
      owners: ownerItem?.resultingOwners ?? acc.owners,
      sessionKeys: commitLandedSessions(acc, bundledSessionIds),
      trustedManagers: mergeLandedManagers(acc, bundledSessionIds),
    }));
    if (ownerItem) {
      setSignedChange(null);
      setOwnerDraft(newOwners.map((o) => o.signerId));
      setScopeDraft(Object.fromEntries(newOwners.map((o) => [o.signerId, o.scope ?? 0])));
    }
  };

  // Shared owner-signed call path for account-backed demos outside the account
  // transaction builder. It deliberately reuses the full compose/broadcast
  // implementation so deployment reconciliation, sub-account delegation, gas
  // estimation, and eligible staged account changes behave consistently.
  //
  // `calls` land as one atomic EIP-8130 transaction, so a demo can pair an
  // approve with the call that spends it. `tokenGas` routes the transaction
  // through a caller-supplied ERC-8168 payer: phase 0 pays that payer a flat
  // fee in the given token and the payer's own ETH covers gas, which is how a
  // demo lets you pay fees in a token you just created. Without it the account
  // pays its own gas.
  const sendActiveCalls = async ({
    calls,
    tokenGas,
    metadata,
  }: {
    calls: { to: Address; data: Hex; value?: string }[];
    tokenGas?: { token: Address; decimals: number; payer: Signer; fee: bigint };
    /** Optional top-level signed app data attached to the transaction. */
    metadata?: string;
  }): Promise<{ hash: Hex; serialized: Hex; mode: 'self' | 'token' }> => {
    if (!acct) throw new Error('Select an account before you continue.');
    if (!calls.length) throw new Error('No calls to send.');
    const signer =
      postChangeOwnerSigners.find((s) => s.id === activeSignerId) ??
      postChangeOwnerSigners[0] ??
      activeSigner;
    if (!signer) throw new Error('No local owner key found for this account.');

    const bundle = pendingBundleFor({ mode: 'owner-send' });
    const presigned = bundle.map((item) => item.change);
    const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : null;
    const payerOpt = tokenGas
      ? {
          address: tokenGas.payer.address,
          phase0: [
            (({ to, data }) => ({ to, data }))(
              encodeTokenTransfer({ token: tokenGas.token, to: tokenGas.payer.address, amount: tokenGas.fee }),
            ),
          ],
          localSigner: tokenGas.payer,
        }
      : undefined;
    const { serialized, nextSeq } = await signComposed(
      acct,
      signer,
      calls.map((call) => newCallRow({ to: call.to, data: call.data, value: call.value ?? '0' })),
      presigned,
      changeSeq,
      metadata?.trim() ? toHex(metadata.trim()) : undefined,
      undefined,
      payerOpt,
    );
    const hash = await broadcast8130(serialized);
    applyLandedBundle(acct, nextSeq, bundle);
    return { hash, serialized, mode: tokenGas ? 'token' : 'self' };
  };

  /**
   * Run several transactions from the active account back to back.
   *
   * Not a loop over `sendActiveCalls`: the reads that call depends on — the
   * account's nonce and whether it has code — are answered by load-balanced RPC
   * replicas whose heads can differ, so re-reading them between two sends can
   * return a view that predates the previous one. That drops the second
   * transaction as a duplicate nonce, or re-attaches the create change to an
   * account that already exists. Both reads happen once here, and each batch
   * gets its sequence counted from there.
   *
   * Pending owner/session changes ride the first batch only. Returns one result
   * per batch; throws on the first failure, leaving earlier batches applied
   * (callers should make each batch meaningful on its own).
   */
  const sendActiveCallsBatches = async ({
    batches,
    tokenGas,
    onBatchStart,
    onBatchResult,
  }: {
    batches: { calls: { to: Address; data: Hex }[] }[];
    tokenGas?: { token: Address; decimals: number; payer: Signer; fee: bigint };
    onBatchStart?: (index: number, total: number) => void;
    onBatchResult?: (index: number, result: { hash: Hex; serialized: Hex; mode: 'self' | 'token' }) => void;
  }): Promise<{ hash: Hex; serialized: Hex; mode: 'self' | 'token' }[]> => {
    if (!acct) throw new Error('Select an account before you continue.');
    if (!batches.length) throw new Error('No calls to send.');
    const signer =
      postChangeOwnerSigners.find((s) => s.id === activeSignerId) ??
      postChangeOwnerSigners[0] ??
      activeSigner;
    if (!signer) throw new Error('No local owner key found for this account.');

    const bundle = pendingBundleFor({ mode: 'owner-send' });
    const presigned = bundle.map((item) => item.change);
    const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : null;
    const payerOpt = tokenGas
      ? {
          address: tokenGas.payer.address,
          phase0: [
            (({ to, data }) => ({ to, data }))(
              encodeTokenTransfer({ token: tokenGas.token, to: tokenGas.payer.address, amount: tokenGas.fee }),
            ),
          ],
          localSigner: tokenGas.payer,
        }
      : undefined;

    // Read the starting nonce a few times and keep the highest: a single read
    // can land on a replica that is a block behind.
    const address = acct.address as Address;
    let startSequence = 0n;
    for (let i = 0; i < 3; i += 1) {
      const count = await getTransactionCount(makeRpcClient(), { address, nonceKey: 0n }).catch(() => null);
      if (count !== null && count > startSequence) startSequence = count;
    }

    // An account's code and the actors bound to it reach every replica a moment
    // after the transaction that wrote them lands, so a batch prepared right
    // behind the one that deployed the account is validated against a replica
    // that has not seen it yet and is rejected with "actor is not bound" before
    // it is ever broadcast. Wait for the state to catch up and prepare it again.
    // A transaction that expired without landing is definitively dropped, so
    // that one can go straight back out. Everything else — a revert, a rejected
    // call, a broadcast whose receipt never arrived — is real and propagates.
    const attemptBatch = async (send: () => Promise<Hex>): Promise<Hex> => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await send();
        } catch (error) {
          if (attempt >= 3) throw error;
          // Broadcast but not included in time. Give it a little longer, then
          // ask the node whether it still holds the transaction: one it has
          // dropped is never coming back, so the batch is signed and sent again
          // on the same nonce. One it still holds must be left alone — a second
          // copy would only collide with it.
          if (error instanceof TxPendingError) {
            const landed = await awaitInclusion(error.txHash, 15_000).catch((err) => {
              if (err instanceof TxPendingError) return null;
              throw err;
            });
            if (landed) return landed;
            const known = await makeRpcClient()
              .request({ method: 'eth_getTransactionByHash', params: [error.txHash] })
              .catch(() => 'unreadable');
            if (known !== null) throw error;
            continue;
          }
          const message = error instanceof Error ? error.message : String(error);
          const expired = /expired before landing/i.test(message);
          if (!expired && !/actor is not bound/i.test(message)) throw error;
          await new Promise((resolve) => setTimeout(resolve, expired ? 1_000 : 5_000));
        }
      }
    };

    const results: { hash: Hex; serialized: Hex; mode: 'self' | 'token' }[] = [];
    const mode: 'self' | 'token' = tokenGas ? 'token' : 'self';
    for (const [index, batch] of batches.entries()) {
      onBatchStart?.(index, batches.length);
      const first = index === 0;
      // Written by whichever signing attempt produced the transaction that
      // landed — a retry re-signs, so these can't be read from the first one.
      let landedSeq: number | null = null;
      let landedSerialized: Hex = '0x';
      const hash = await attemptBatch(async () => {
        const { serialized, nextSeq } = await signComposed(
          acct,
          signer,
          batch.calls.map((call) => newCallRow({ ...call, value: '0' })),
          first ? presigned : [],
          first ? changeSeq : null,
          undefined,
          undefined,
          payerOpt,
          { nonceSequence: startSequence + BigInt(index), assumeDeployed: !first || undefined },
        );
        landedSeq = nextSeq;
        landedSerialized = serialized;
        return broadcast8130(serialized);
      });
      if (first && landedSeq !== null) applyLandedBundle(acct, landedSeq, bundle);
      const result = { hash, serialized: landedSerialized, mode };
      results.push(result);
      onBatchResult?.(index, result);
    }
    return results;
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
  // Returns true once a signed change is staged so callers can open the apply
  // dialog only on success.
  const signOwnerChange = async (): Promise<boolean> => {
    if (!acct || keyChangeCount === 0) return false;
    const changeWS = configChangeSigner ?? activeSigner;
    if (!changeWS) return false;
    setApplying(true);
    try {
      const changeSigner = await buildSigner(changeWS);
      const changeAccount = nativeAccountFor(acct, changeSigner, changeWS.authenticator);
      // Owner (actor) changes live on the GLOBAL multichain config counter
      // (configChainId 0) so they sequence independently of session-key
      // authorizes (per-chain local counter) — a pending session key can't shift
      // this sequence, and vice versa.
      const chainId = 0;
      // Neither create nor delegation consumes the multichain counter, so the
      // network-returned value is always the sequence to sign.
      const { multichain } = await fetchOnChainAccountState(changeAccount.address as Address);
      const nextSeq = Number(multichain);
      const change = await changeAccount.change(
        [
          ...buildAuthorizeActions().map((s) =>
            s.scope
              ? authorizeActor({ actorId: s.actorId, authenticator: s.authenticator }, { scope: s.scope })
              : authorizeActor({ actorId: s.actorId, authenticator: s.authenticator }),
          ),
          ...pendingRevoke.map((o) => revokeActor(o.actorId)),
        ],
        { channel: 'multichain', chainId, sequence: multichain },
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
      return true;
    } catch (err) {
      const e = err as { message?: string; name?: string };
      toast.error(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
      return false;
    } finally {
      setApplying(false);
    }
  };

  // Apply an already-signed owner change now: a post-change owner signs a no-op
  // tx that carries it.
  const applyOwnerNow = async (
    onStatus?: (status: '' | 'submitting' | 'confirming') => void,
  ): Promise<{ hash: Hex; label: string } | null> => {
    if (!acct || !signedChange || signedChange.accountId !== acct.id) return null;
    const txWS = postChangeOwnerSigners.find((s) => s.id === activeSignerId) ?? postChangeOwnerSigners[0] ?? activeSigner;
    if (!txWS) return null;
    const bundle = pendingBundleFor({ mode: 'owner-send' });
    if (!bundle.some((i) => !i.sessionId))
      throw new Error(
        'A pending session key is ahead in the config sequence. Apply or discard it first, then apply the owner change.',
      );
    const presigned = bundle.map((i) => i.change);
    const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : signedChange.sequence;
    const summary = signedChange.summary;
    setApplying(true);
    try {
      const { serialized, nextSeq } = await signComposed(acct, txWS, [newCallRow()], presigned, changeSeq, undefined, undefined, undefined);
      const txHash = await broadcast8130(serialized, onStatus);
      applyLandedBundle(acct, nextSeq, bundle);
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
      return { hash: txHash, label: 'Owner change' };
    } finally {
      setApplying(false);
      onStatus?.('');
    }
  };

  // --- session keys ------------------------------------------------------
  // Mint the owner-signed authorization for a session key. `defer` captures it
  // without broadcasting — the key authorizes on its first transaction (or via
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
      // (the caller broadcasts the returned `serialized`, then calls `commit()`
      // to persist the key + `deployed` state ONLY once the tx has landed).
      defer?: boolean;
    },
  ): Promise<(AppSessionKey & { commit?: () => void }) | null> => {
    const defer = opts.defer ?? true;
    if (!acct || !activeSigner) return null;
    const skChain = resolveChain(opts.chainShort);
    const ownerSigner = await buildSigner(activeSigner);
    const account = nativeAccountFor(acct, ownerSigner, activeSigner.authenticator);
    // Every session key in this demo is policy-gated (an owner-signed authorize
    // always binds a SessionPolicy via the PolicyManager — see below), so grant
    // SCOPE.policy (key is constrained to its bound PolicyManager) plus SCOPE.nonce
    // (the send path signs with the account's sequenced nonce key; without the
    // nonce bit the node rejects the send with "actor scope insufficient"). This
    // does NOT grant config-change rights (that's the admin scope 0, for owners).
    const scope = SCOPE.policy | SCOPE.nonce;
    const expiry = opts.expirySecs ? BigInt(Math.floor(Date.now() / 1000) + opts.expirySecs) : 0n;

    if (!skChain.deployment.policies) throw new Error(`Session policies are not available on ${skChain.name}.`);
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
    const policy: AppPolicy = {
      type: session.actorPolicy.type,
      label: opts.policyLabel,
      manager: session.manager,
      policy: session.policy,
      policyConfig,
      // Persist the full binding so every later execute (see `sessionFor`)
      // recomputes the same commitment the account authorized.
      validAfter: session.binding.validAfter,
      validUntil: session.binding.validUntil,
      salt: session.binding.salt,
      commitment: session.commitment,
      params: summary,
      limits,
    };

    // Session-key authorizes live on the per-chain LOCAL config counter,
    // independent of owner changes (multichain counter). Start from a fresh
    // network read, then reserve positions for already-staged session changes.
    const chainId = skChain.id || 84532;
    const liveState = await fetchOnChainAccountState(account.address as Address);
    const bootstrapChange = liveState.deployed ? undefined : firstDeployChange(acct, account);
    const sequence = localConfigSequence(liveState.local, bootstrapChange) + BigInt(pendingSessionChangeCount());
    const nextSeq = Number(sequence);

    // Register the manager as a trusted-executor actor on first use so its
    // executeBatch callback into the account succeeds (skip if already trusted).
    const configChanges = [
      authorizeActor({ actorId: target.actorId, authenticator: target.authenticator }, { scope, expiry, policy: actorPolicy }),
    ];
    let registeredManager = false;
    // The manager is a one-time, account-level registration that outlives any
    // single session key (it is never revoked — see revokeSessionKey). Re-adding
    // an already-registered actor reverts, so skip if it's already trusted: tracked
    // explicitly in `trustedManagers`, or (legacy records / pre-landing) inferred
    // from a live session key sharing the same manager.
    const managerLc = policy.manager.toLowerCase();
    const managerTrusted =
      (acct.trustedManagers ?? []).some((m) => m.toLowerCase() === managerLc) ||
      acct.sessionKeys.some((sk) => sk.policy?.manager?.toLowerCase() === managerLc);
    if (!managerTrusted) {
      configChanges.unshift(authorizeActor(key.trustedExecutor(policy.manager), { scope: SCOPE.sender }));
      registeredManager = true;
    }
    const accountChanges: AaAccountChange[] = [];
    if (bootstrapChange) accountChanges.push(bootstrapChange);
    const configChange = await account.change(configChanges, { chainId, sequence });
    accountChanges.push(configChange);

    // Defer: hold the owner-signed authorization on the key; it authorizes on the
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
        pendingAuth: { change: configChange, sequence: nextSeq, registeredManager },
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
          'authorizes on first use',
          expiry ? formatExpiry(expiry) : 'no expiry',
        ],
        network: skChain.name,
        mode: skChain.mode,
        account: acct.address,
      });
      return deferredKey;
    }

    // Immediate: sign the authorize tx now (owner-signed). There is no install
    // call — the policy binding is committed entirely by the actor change; the
    // caller broadcasts `serialized`.
    const nonceSeqSk = await getTransactionCount(makeRpcClient(), {
      address: account.address as Address,
      nonceKey: 0n,
    });
    const skSenderAuthAuthenticator: Address =
      activeSigner.kind === 'p256'
        ? canonicalAuthenticators.p256
        : activeSigner.kind === 'passkey'
          ? canonicalAuthenticators.passkey
          : canonicalAuthenticators.k1;
    let skGas = 400_000n;
    if (chain.mode === 'eip8130-native') {
      try {
        const estimated = await estimateGas(makeRpcClient(), {
          sender: account.address as Address,
          // Owner signs this authorize tx, so name the owner's actor for full
          // node simulation (resolves the new actor's scope + policy binding).
          senderActorId: activeSigner.actorId,
          accountChanges,
          calls: [],
          nonceSequence: Number(nonceSeqSk),
          senderAuthAuthenticator: skSenderAuthAuthenticator,
        });
        skGas = safeGasLimit(
          estimated,
          estimateTxGas({
            mode: chain.mode,
            deploy: !!bootstrapChange,
            calls: 0,
            keyChanges: accountChanges.filter((c) => c.type === 'config').length,
          }),
        );
      } catch (err) {
        if (isUnsupportedRpcError(err) || bootstrapChange?.type === 'create') skGas = 400_000n;
        else throw err;
      }
    }
    const serialized = await account.signTransaction({
      chainId,
      accountChanges,
      calls: [],
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
    // Don't persist the key, flip `deployed`, or advance `configSeq` yet: the
    // subscribed/"Deployed" UI is derived from this local state, so committing
    // before the tx lands would leave the account looking subscribed/deployed
    // even if the authorize+install reverts. The caller broadcasts `serialized`
    // and calls `commit()` only after the tx has landed successfully.
    const commit = () => {
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
          `binding ${short(policy.commitment, 6, 4)}`,
          expiry ? formatExpiry(expiry) : 'no expiry',
        ],
        network: skChain.name,
        mode: skChain.mode,
        serialized,
        account: acct.address,
      });
    };
    return { ...sk, commit };
  };

  // Apply a staged session-key change now: an owner signs a no-op tx carrying its
  // authorize + install (plus lower-sequence prerequisites) — or its staged revoke.
  const applySessionKeyNow = async (
    skId: string,
    onStatus?: (status: '' | 'submitting' | 'confirming') => void,
  ): Promise<{ hash: Hex; label: string } | null> => {
    if (!acct || !activeSigner) return null;
    const sk = acct.sessionKeys.find((x) => x.id === skId);
    if (!sk || (!sk.pendingAuth && !sk.pendingRevoke)) return null;
    const isRevoke = !!sk.pendingRevoke && !sk.pendingAuth;
    const txWS = postChangeOwnerSigners.find((s) => s.id === activeSignerId) ?? postChangeOwnerSigners[0] ?? activeSigner;
    const bundle = pendingBundleFor({ mode: 'session-send', sessionId: sk.id });
    const presigned = bundle.map((i) => i.change);
    const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : (sk.pendingAuth?.sequence ?? sk.pendingRevoke?.sequence ?? null);
    setSkApplyingId(sk.id);
    try {
      const { serialized, nextSeq } = await signComposed(acct, txWS, [newCallRow()], presigned, changeSeq, undefined, undefined, undefined);
      const txHash = await broadcast8130(serialized, onStatus);
      applyLandedBundle(acct, nextSeq, bundle);
      pushActivity({
        kind: isRevoke ? 'revoke' : 'session',
        title: isRevoke ? `Session key revoked · ${sk.label}` : `Session key installed · ${sk.label}`,
        detail: scopeChips(sk.scope).join(' · '),
        changes: isRevoke
          ? [`revoke ${sk.label}`, 'manager kept']
          : [`authorize ${sk.label}`, ...(sk.policy ? [`policy: ${sk.policy.label}`, 'install'] : [])],
        network: chain.name,
        mode: chain.mode,
        txHash,
        serialized,
        account: acct.address,
      });
      return { hash: txHash, label: `Session key: ${sk.label}` };
    } finally {
      setSkApplyingId(null);
      onStatus?.('');
    }
  };

  // Revoke a session key. A never-landed key (still staged for first use) or an
  // undeployed account has no on-chain actor, so it's just discarded locally. An
  // on-chain key is revoked by an owner-signed `revokeActor` config change on the
  // per-chain LOCAL counter, STAGED (not broadcast): it rides the next session-key
  // tx or an explicit "Apply now", and the key record is removed only once it
  // lands. The PolicyManager is intentionally never revoked (other keys share it).
  // Returns how the revoke resolved so callers can react: `'discarded'` (removed
  // locally, nothing to apply), `'staged'` (an on-chain revoke is now pending and
  // must be applied), `'noop'` (already staged), or `'error'`.
  const revokeSessionKey = async (id: string): Promise<'discarded' | 'staged' | 'noop' | 'error'> => {
    if (!acct) return 'error';
    const sk = acct.sessionKeys.find((x) => x.id === id);
    if (!sk) return 'error';

    const discard = () => {
      updateAccount(acct.id, (a) => ({ ...a, sessionKeys: a.sessionKeys.filter((x) => x.id !== id) }));
      pushActivity({
        kind: 'revoke',
        title: `Session key discarded · ${sk.label}`,
        detail: scopeChips(sk.scope).join(' · '),
        account: acct.address,
      });
      return 'discarded' as const;
    };

    // A staged authorization has never landed, so there is nothing on-chain to revoke.
    if (sk.pendingAuth) return discard();

    // Already staged — no-op (use "Apply now" to land it, or "Undo" to discard).
    if (sk.pendingRevoke) return 'noop';

    const changeWS = ownerSigners.find((s) => s.id === activeSignerId) ?? ownerSigners[0] ?? activeSigner;
    if (!changeWS) {
      toast.error('Select an owner key to sign the revoke.');
      return 'error';
    }
    try {
      const liveState = await fetchOnChainAccountState(acct.address);
      if (!liveState.deployed) return discard();

      const changeSigner = await buildSigner(changeWS);
      const changeAccount = nativeAccountFor(acct, changeSigner, changeWS.authenticator);
      // Session-key changes are on the per-chain LOCAL counter. Read it live and
      // reserve positions for other already-staged session changes.
      const chainId = chain.id || 84532;
      const sequence = liveState.local + BigInt(pendingSessionChangeCount());
      const nextSeq = Number(sequence);
      const change = await changeAccount.change([revokeActor(sk.actorId)], { chainId, sequence });
      updateAccount(acct.id, (a) => ({
        ...a,
        sessionKeys: a.sessionKeys.map((x) => (x.id === id ? { ...x, pendingRevoke: { change, sequence: nextSeq } } : x)),
      }));
      pushActivity({
        kind: 'revoke',
        title: `Session key revoke staged · ${sk.label}`,
        detail: scopeChips(sk.scope).join(' · '),
        changes: [`revoke ${sk.label}`, 'manager kept', 'applies on next tx'],
        account: acct.address,
      });
      return 'staged';
    } catch (err) {
      const e = err as { message?: string; name?: string };
      toast.error(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
      return 'error';
    }
  };

  // Discard a staged (signed-but-not-landed) revoke — the key stays active.
  const undoStagedRevoke = (id: string) => {
    if (!acct) return;
    updateAccount(acct.id, (a) => ({
      ...a,
      sessionKeys: a.sessionKeys.map((x) => (x.id === id ? { ...x, pendingRevoke: undefined } : x)),
    }));
  };

  // --- config-sequence recovery -----------------------------------------
  // Re-sign every staged (not-yet-landed) session-key authorization at the current
  // local sequence. Recovers from "config change sequence mismatch": the baked
  // sequence went stale (the local counter advanced — e.g. another change landed).
  // All pending keys share the per-chain local counter, so they re-sequence
  // together (consecutive). Returns false if it couldn't run (no owner selected).
  const resignPendingSessionKeys = async (): Promise<boolean> => {
    if (!acct) return false;
    const pending = acct.sessionKeys.filter((sk) => sk.pendingAuth && sk.policy);
    if (pending.length === 0) return true;
    const signerWS = ownerSigners.find((s) => s.id === activeSignerId) ?? ownerSigners[0] ?? activeSigner;
    if (!signerWS) {
      toast.error('Select an owner key to re-sign the session-key authorization.');
      return false;
    }
    const ownerSigner = await buildSigner(signerWS);
    const account = nativeAccountFor(acct, ownerSigner, signerWS.authenticator);
    const liveState = await fetchOnChainAccountState(account.address as Address);
    const bootstrapChange = liveState.deployed ? undefined : firstDeployChange(acct, account);
    const base = localConfigSequence(liveState.local, bootstrapChange);
    // Re-sign in current-sequence order so relative ordering is preserved.
    const ordered = [...pending].sort((a, b) => (a.pendingAuth?.sequence ?? 0) - (b.pendingAuth?.sequence ?? 0));
    const updates = new Map<string, NonNullable<AppSessionKey['pendingAuth']>>();
    // Managers registered within THIS batch — so two keys sharing one manager don't
    // both try to register it (the second would revert).
    const registeredInBatch = new Set<string>();
    let offset = 0;
    for (const sk of ordered) {
      if (!sk.policy || !sk.pendingAuth) continue;
      const skChainId = sk.chainId ?? (chain.id || 84532);
      const sequence = base + BigInt(offset);
      const seq = Number(sequence);
      const managerLc = sk.policy.manager.toLowerCase();
      const managerTrusted =
        (acct.trustedManagers ?? []).some((m) => m.toLowerCase() === managerLc) ||
        acct.sessionKeys.some((k) => !k.pendingAuth && k.policy?.manager?.toLowerCase() === managerLc) ||
        registeredInBatch.has(managerLc);
      const session = defineSessionPolicy({
        account: account.address,
        policy: sk.policy.policy,
        policyConfig: sk.policy.policyConfig,
        manager: sk.policy.manager,
        validUntil: sk.expiry,
      });
      const configChanges = [
        authorizeActor({ actorId: sk.actorId, authenticator: sk.authenticator }, { scope: sk.scope, expiry: sk.expiry, policy: session.actorPolicy }),
      ];
      let registeredManager = false;
      if (!managerTrusted) {
        configChanges.unshift(authorizeActor(key.trustedExecutor(sk.policy.manager), { scope: SCOPE.sender }));
        registeredManager = true;
        registeredInBatch.add(managerLc);
      }
      const change = await account.change(configChanges, { chainId: skChainId, sequence });
      updates.set(sk.id, { change, sequence: seq, registeredManager });
      offset++;
    }
    updateAccount(acct.id, (a) => ({
      ...a,
      sessionKeys: a.sessionKeys.map((sk) => {
        const u = updates.get(sk.id);
        return u ? { ...sk, pendingAuth: u } : sk;
      }),
    }));
    return true;
  };

  // Drop staged (never-landed) session keys by id — they were never registered
  // on-chain, so discarding them locally is all that's needed.
  const dropPendingSessionKeys = (ids: string[]) => {
    if (!acct || ids.length === 0) return;
    const idSet = new Set(ids);
    const dropped = acct.sessionKeys.filter((sk) => idSet.has(sk.id) && sk.pendingAuth);
    if (dropped.length === 0) return;
    updateAccount(acct.id, (a) => ({
      ...a,
      sessionKeys: a.sessionKeys.filter((sk) => !(idSet.has(sk.id) && sk.pendingAuth)),
    }));
    for (const sk of dropped)
      pushActivity({
        kind: 'revoke',
        title: `Staged session key dropped · ${sk.label}`,
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
      spare = mintAppKey(`${label.trim() || 'Spending Account'} key`);
      if (spare?.address) {
        actors.push(key.k1(spare.address));
        signerIds.push(spare.id);
      }
    }
    const initialActors = sortActors(actors);
    const subAddress = computeAddress({
      userSalt: subSalt,
      code,
      initialActors,
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
    // Selectable account record for the sub. The on-chain owner is the parent (via
    // key.delegate) — captured as a StoredActor with no wallet signerId so it never
    // resolves to a local key; `ownerSigners` instead pulls the parent's owner
    // signers for a record with `parentId` set. A minted spare key is a real direct
    // owner and stays selectable on its own.
    const delegateActor: StoredActor = {
      signerId: '',
      actorId: key.delegate(acct.address).actorId,
      authenticator: canonicalAuthenticators.delegate,
      kind: 'k1',
      label: `${acct.label} (delegate)`,
      identity: acct.address,
      scope: 0,
    };
    const subStoredActors = sortActors([delegateActor, ...(spare ? [toStoredActor(spare)] : [])]);
    const subRecord: StoredAccount = {
      id: crypto.randomUUID(),
      label: sub.label,
      type: 'smart',
      parentId: acct.id,
      saltField: '',
      salt: subSalt,
      address: subAddress,
      initialActors: subStoredActors,
      owners: [...subStoredActors],
      deployed: false,
      configSeq: 0,
      sessionKeys: [],
      subAccounts: [],
      createdAt: Date.now(),
    };
    updateAccount(acct.id, (a) => ({ ...a, subAccounts: [...a.subAccounts, sub] }));
    setAccounts((prev) => [...prev, subRecord]);
    pushActivity({
      kind: 'subaccount',
      title: `Sub-account created · ${sub.label}`,
      detail: `Delegates to ${short(acct.address)}`,
      changes: ['owner: this account', ...(spare ? [`owner: ${spare.label}`] : [])],
      account: subAddress,
    });
    autoFundNewAccount(subAddress);
    return sub;
  };

  return {
    // Store (useAccounts passthrough) + shared derivations
    signers,
    accounts,
    addAccount,
    activeAccountId,
    setActiveAccountId,
    addressBook,
    activity,
    networkShort,
    setNetworkShort,
    hydrated,
    deleteAccount,
    acct,

    // Chain
    chain,
    code,

    // Shared transient state
    busy,
    activeSignerId,
    setActiveSignerId,
    activeSigner,
    regenesisNotice,
    setRegenesisNotice,

    // Faucet
    faucetBusy,
    requestFaucet,

    // Signer + account-building primitives (used by CreateAccountModal)
    usedSignerIds,
    deleteSigner,
    createSigner,
    pushActivity,
    autoFundNewAccount,

    // Owner-change staging + apply
    ownerSigners,
    sessionSigners,
    pendingAuthorize,
    pendingRevoke,
    pendingScope,
    keyChangeCount,
    postChangeOwnerSigners,
    ownerDraft,
    scopeDraft,
    applying,
    stageAddOwner,
    stageRemoveOwner,
    setOwnerScope,
    mintOwner,
    signOwnerChange,
    applyOwnerNow,
    discardOwnerChanges,

    // Signing engine (also used by each surface's own Transact flow)
    broadcast8130,
    signComposed,
    sendActiveCalls,
    sendActiveCallsBatches,
    applyLandedBundle,
    pendingBundleFor,

    // Config-sequence recovery primitives (the recovery prompt lives in the modal)
    resignPendingSessionKeys,
    dropPendingSessionKeys,

    // Session-key apply (the authorize/revoke form lives in SessionKeyEditor)
    skApplyingId,
    policyRemaining,
    applySessionKeyNow,
    revokeSessionKey,
    undoStagedRevoke,
    doAuthorizeSession,

    // Sub-accounts
    doCreateSubAccount,
    mintAppKey,
  };
}

// Shared instance handed down via context so components read only what they
// need instead of receiving a giant `engine` prop.
const AccountEngineContext = createContext<AccountEngineCore | null>(null);

export function AccountEngineProvider({ children }: { children: ReactNode }) {
  const engine = useAccountEngineCore();
  return <AccountEngineContext.Provider value={engine}>{children}</AccountEngineContext.Provider>;
}

export function useAccountEngine(): AccountEngineCore {
  const ctx = useContext(AccountEngineContext);
  if (!ctx) throw new Error('useAccountEngine must be used within an <AccountEngineProvider>.');
  return ctx;
}

type AccountEngineCore = ReturnType<typeof useAccountEngineCore>;
