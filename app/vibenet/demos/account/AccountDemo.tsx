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
  delegateAuthSize,
  ecrecoverAuthenticator,
  type Eip8130Deployment,
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
  toDelegate8130Signer,
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
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { AnimatedArrowIcon, CloseIcon } from '../../../components/ui/icons';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Text } from '../../../components/ui/Text';
import { toast } from 'sonner';
import { vibenetApi } from '../../library/client';
import { ACCOUNT_RPC_URL, VIBENET_EXPLORER_PATH } from '../../library/config';
import { AnimatedAmount } from '../_components/AnimatedAmount';
import { DemoHeader } from '../_components/DemoHeader';
import { Spinner } from '../../../components/ui/Spinner';
import { Tabs } from '../../../components/ui/Tabs';
import { Stat } from '../_components/Stat';
import { ActivityLog } from './components/ActivityLog';
import { AppsView } from './components/AppsView';
import { ConfigView } from './components/ConfigView';
import { AccountAvatar, AccountIdentity, Badge, CheckIcon, KindBadge } from './components/primitives';
import { DEMO_APPS, type DemoApp } from './library/apps';
import {
  basescanTx,
  BASE_SEPOLIA_USDC,
  DEMO_CHAINS,
  type DemoChain,
  deploymentFromContracts,
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
  valueBearingCallCount,
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

// `createAccount`/`importAccount` bootstrap an account with its LOCAL config
// sequence set to 1 (it doubles as the "initialized" flag). So the first
// local-channel actor change (a session-key authorize) is sequence 1, not 0. The
// MULTICHAIN counter (owner changes) is untouched by create and starts at 0.
const POST_CREATE_LOCAL_SEQ = 1;

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
function isSeqMismatch(err: unknown): boolean {
  const s = `${estimateFailureReason(err)} ${err instanceof Error ? err.message : String(err)}`;
  return /config change sequence mismatch/i.test(s);
}

/** Collapse a giant viem error dump to its `Details:` line (or first line) for display. */
function conciseError(message: string): string {
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
  // Must match the vendor's exact ordering: `createAccount`/`computeAddress`
  // require initialActors sorted by `actorId` as a BIGINT in strictly ascending
  // order (no duplicates). A lexicographic string sort diverges from numeric
  // ordering whenever actorIds differ in hex width or case (e.g. an unpadded or
  // upper-cased id), which surfaces as "initialActors are not sorted".
  return [...actors].sort((a, b) => {
    const av = BigInt(a.actorId);
    const bv = BigInt(b.actorId);
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
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
    super(`Transaction is pending — not yet included (${hash}).`);
    this.txHash = hash;
  }
}

// ---------------------------------------------------------------------------

export function AccountDemo() {

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
  const [detailsOpen, setDetailsOpen] = useState(false);

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
  const [skRevokingId, setSkRevokingId] = useState<string | null>(null);
  // A reverting gas estimate (with `senderActorId` the node can simulate, so a
  // revert means the tx would actually fail). Surfaces a "Send anyway" escape
  // hatch rather than silently broadcasting a doomed tx on a heuristic floor.
  const [estimateBlocked, setEstimateBlocked] = useState<string | null>(null);
  // One-shot: when true, the next estimate that would block instead prices the tx
  // at a high ceiling and broadcasts (the user chose "Send anyway").
  const overrideEstimateRef = useRef(false);
  // True only while a Transact send is composing — the "Send anyway" escape hatch
  // retries the transact flow, so only transact sends surface `estimateBlocked`.
  // Config apply flows (owner/session) keep the over-provisioned floor fallback.
  const blockOnRevertRef = useRef(false);
  // Transient success/info line (e.g. after a re-sign or drop recovery).
  const [infoMsg, setInfoMsg] = useState('');
  // Recovery prompt shown when a staged config change reverts "config change
  // sequence mismatch": offer to re-sign it at the current sequence, or drop it.
  const [seqRecovery, setSeqRecovery] = useState<{
    what: string;
    resign: () => Promise<void> | void;
    drop: () => void;
    busy?: boolean;
  } | null>(null);
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
  const [activityOpen, setActivityOpen] = useState(true);
  const [transactModalOpen, setTransactModalOpen] = useState(false);

  // EIP-8130 system-contract addresses, resolved live from the dataplane so a
  // devnet reset (which redeploys them to new addresses) never needs a code
  // change. `null` until the first fetch lands → the static fallback in
  // chains.ts is used. See the fetch effect below.
  const [liveDeployment, setLiveDeployment] = useState<Eip8130Deployment | null>(
    null,
  );
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

  const chain = useMemo(
    () => resolveChain(networkShort),
    [resolveChain, networkShort],
  );
  // Proxy code for a smart account. MUST target a DEPLOYED implementation: with a
  // codeless impl, policy-gated session-key sends route PolicyManager.execute ->
  // account.executeBatch into empty code — the tx "succeeds", the policy consumes
  // its spend counter, `PolicyExecuted` fires, yet no funds move.
  //
  // `accounts.upgradeable` (UpgradeableAccount) was removed from the canonical
  // eip-8130 deploy and is NOT deployed on the devnet, which caused exactly that
  // failure. Use `accounts.default` (deployed DefaultAccount).
  const code = useMemo(
    () => upgradeableProxyBytecode(chain.deployment.accounts.default),
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
  // `loaded` (ref) is read synchronously inside async callbacks (regenesis).
  // `hydrated` (state) gates the SAVE effect: it must be state, not a ref, so the
  // save effect's first run (on mount, before the load's setState commits) sees
  // `false` via its render closure and skips — otherwise it would clobber
  // localStorage with the empty initial state before the loaded data lands. This
  // matters under React StrictMode (dev), which double-invokes effects: a ref
  // guard is already `true` on the save effect's mount run and overwrites storage
  // with `[]`, which the second load pass then reads back as empty — losing the
  // account on refresh.
  const loaded = useRef(false);
  const [hydrated, setHydrated] = useState(false);
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
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
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
  }, [hydrated, signers, accounts, activeAccountId, activity, networkShort, genesisHash]);

  // Auto-collapse the activity sheet after a brief preview on load.
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => setActivityOpen(false), 1500);
    return () => window.clearTimeout(timer);
  }, [hydrated]);

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
        setLiveDeployment((prev) =>
          prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
        );
      })
      .catch(() => {
        /* offline / aborted → keep last-known-good deployment */
      });
    return () => controller.abort();
  }, [genesisHash]);

  const acct = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
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

  // Session keys can only ride sponsored (EIP-8168 "free") transactions — ETH
  // and USDV-payer gas modes aren't a supported combination and will fail
  // estimation/submission. Force sponsored mode as soon as a session key
  // becomes the selected signer.
  useEffect(() => {
    if (txIsSession) setGasMode('free');
  }, [txIsSession]);

  type PendingChangeItem = {
    change: AaAccountChange;
    sequence: number;
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
    for (const sk of acct.sessionKeys) {
      if (sk.pendingAuth)
        items.push({
          change: sk.pendingAuth.change,
          sequence: sk.pendingAuth.sequence,
          sessionId: sk.id,
        });
      // A staged revoke is a local-counter change too — carry it like an
      // authorization so it rides a session send / apply-all.
      if (sk.pendingRevoke)
        items.push({
          change: sk.pendingRevoke.change,
          sequence: sk.pendingRevoke.sequence,
          sessionId: sk.id,
        });
    }
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
    const sessions = (acct?.sessionKeys ?? []).filter((sk) => sk.pendingAuth || sk.pendingRevoke).length;
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
      valueCalls: valueBearingCallCount(calls),
    });
  }, [acct, chain.mode, calls, keyChangeCount]);

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
    if (!acct) return;
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
  }, [acct, networkShort]);

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

  // Generate a throwaway EVM address and copy it — a convenience for filling a
  // recipient field when experimenting in the transaction modal.
  const copyRandomAddress = () => copy(privateKeyToAccount(generatePrivateKey()).address, 'randaddr');

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
      toast.success('Topped up successfully');
    } catch (e) {
      setError((e as Error).message);
      toast.error('Top up failed');
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
        detail: 'Delegates to DefaultAccount on first use',
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
      detail: 'Stored locally · deploys on first use',
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
        const delegateSigner = toDelegate8130Signer({
          delegateAccount: parent.address as Address,
          nestedSigner: signer,
          nestedAuthenticator: authenticator,
        });
        return to8130Account({
          signer: delegateSigner,
          authenticator: delegateSigner.authenticator,
          userSalt: a.salt,
          code,
          initialActors: sortActors(actorPairs(a.initialActors)),
          accountConfigAddress: chain.deployment.accountConfiguration,
        });
      }
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
        throw new Error(`Transaction reverted onchain (${txHash}).`);
      const phases = receipt.eip8130?.phaseStatuses ?? [];
      const failedPhase = phases.findIndex((s: Hex) => s === '0x0');
      if (failedPhase !== -1)
        throw new Error(`Phase ${failedPhase} reverted (tx ${txHash}).`);
    } catch (err) {
      if ((err as Error)?.message?.includes('timed out')) throw new TxPendingError(txHash);
      throw err;
    }
    return txHash;
  };

  // Live on-chain config sequence for a deployed account (null on any error, so
  // callers fall back to the stored value).
  // Reads the account's two config-change counters:
  //   - `multichain` (configChainId 0) — carries OWNER (actor) changes, so they
  //     sequence independently of session-key authorizes.
  //   - `local` (per-chain) — carries session-key authorizes.
  // Keeping them on separate counters means a pending session key can't shift an
  // owner change's sequence (or vice versa) — the classic "config change sequence
  // mismatch". Never guess a live sequence (a wrong value reverts on-chain): on a
  // read failure we THROW so the caller aborts signing instead of using a guess.
  const fetchOnChainConfigSeq = async (
    address: Address,
  ): Promise<{ local: number; multichain: number }> => {
    try {
      const { local, multichain } = await getConfigSequence8130(makeRpcClient(), {
        accountConfiguration: chain.deployment.accountConfiguration as Address,
        account: address,
      });
      return { local: Number(local), multichain: Number(multichain) };
    } catch (err) {
      const reason = (err as { message?: string })?.message ?? String(err);
      throw new Error(
        `Couldn't read the on-chain config sequence for ${address}: ${reason}. Not signing, to avoid a sequence mismatch.`,
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
    payerOpt?: { address: Address; phase0?: { to: Address; data: Hex }[] },
  ): Promise<{ serialized: Hex; nextSeq: number }> => {
    const signer = await buildSigner(signerWS);
    const account = nativeAccountFor(a, signer, signerWS.authenticator);
    const chainId = chain.id || 84532;
    const accountChanges: AaAccountChange[] = [];
    let nextSeq = a.configSeq;

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

    // Reconcile the stored "deployed" flag against on-chain code in BOTH directions
    // before composing (also repairs localStorage when the browser missed a receipt):
    //   - code gone (e.g. devnet reset) → treat as undeployed, include create/delegate
    //   - code exists after a timed-out/reverted later phase → do NOT recreate
    let effectivelyDeployed = a.deployed;
    try {
      const codeAt = await makeRpcClient().request({
        method: 'eth_getCode',
        params: [account.address as `0x${string}`, 'latest'],
      });
      effectivelyDeployed = !!codeAt && codeAt !== '0x';
      if (effectivelyDeployed !== a.deployed) updateAccount(a.id, { deployed: effectivelyDeployed });
    } catch {
      /* RPC unavailable — keep the stored flag */
    }
    if (!effectivelyDeployed) accountChanges.push(firstDeployChange(a, account));
    if (presignedChanges.length > 0) {
      nextSeq = changeSeq ?? a.configSeq;
      accountChanges.push(...presignedChanges);
    }

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

    let nonceSequence: bigint;
    try {
      nonceSequence = await getTransactionCount8130(makeRpcClient(), {
        address: account.address as Address,
        nonceKey: 0n,
      });
    } catch {
      nonceSequence = effectivelyDeployed ? 1n : 0n;
    }

    // Authenticator hint so estimateGas8130 shapes the senderAuth stub for the
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
      isDelegateSub && parentAcct
        ? key.delegate(parentAcct.address as Address).actorId
        : signerWS.actorId;

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
        const estimated = await estimateGas8130(makeRpcClient(), {
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
        } else if (overrideEstimateRef.current) {
          // User chose "Send anyway": price at a high ceiling so an under-estimate
          // isn't the cause of a revert. If it still reverts, it's a genuine logic
          // failure and the gas is spent (self-pay) / rejected (payer).
          gasLimit = BigInt(Math.max(floorGas(true) * 2, 2_000_000));
        } else if (blockOnRevertRef.current) {
          // Genuine reverting estimate on a Transact send — surface it instead of
          // broadcasting a doomed tx. The Transact view shows a "Send anyway" hatch.
          setEstimateBlocked(estimateFailureReason(err));
          throw new Error(
            `Gas estimate failed — this transaction would revert: ${estimateFailureReason(err)}`,
          );
        } else {
          // Non-transact caller (config apply flows) — keep the over-provisioned
          // floor so a genuine revert surfaces via the normal on-chain error path.
          gasLimit = BigInt(floorGas(true) || 200_000);
        }
      }
    } else {
      gasLimit = BigInt(floorGas(true) || 200_000);
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
    setTransactModalOpen(false);
    setActivityOpen(true);
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
    if (txIsSession && gasMode !== 'free') {
      setError('Session keys can only send sponsored (free) transactions. Switch gas to Sponsored.');
      return;
    }
    if (txIsSession && !acct.deployed && !activeSessionKey?.pendingAuth) {
      setError('Authorize this session key with an owner key first (Apply now).');
      return;
    }
    setSigning(true);
    setError('');
    setInfoMsg('');
    setSeqRecovery(null);
    // Clear any prior "would revert" block; a fresh estimate re-sets it if needed.
    setEstimateBlocked(null);
    blockOnRevertRef.current = true; // transact send: surface a reverting estimate
    // Captured for sequence-mismatch recovery in the catch (what this tx carried).
    let seqCtx: { sessionIds: string[]; hasOwner: boolean } = { sessionIds: [], hasOwner: false };
    try {
      const bundle = pendingBundleFor(
        txIsSession ? { mode: 'session-send', sessionId: activeSessionKey?.id } : { mode: 'owner-send' },
      );
      seqCtx = {
        sessionIds: bundle.flatMap((i) => (i.sessionId ? [i.sessionId] : [])),
        hasOwner: bundle.some((i) => i.resultingOwners),
      };
      const presigned = bundle.map((i) => i.change);
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
      if (handleSeqMismatch(err, seqCtx)) return false;
      const e = err as { message?: string; name?: string };
      setError(conciseError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err))));
      return false;
    } finally {
      setSigning(false);
      setSubmitStatus('');
      overrideEstimateRef.current = false; // one-shot "Send anyway"
      blockOnRevertRef.current = false;
    }
  };

  // Transact: native sign co-signed by an ERC-8168 payer service.
  //  - "free": prefer per-account sponsorship, fall back to USDV when spent.
  //  - "usdv": always pay gas in USDV (phase-0 transfer to the payer).
  const doSponsoredSign = async () => {
    if (!acct || !txSigner || !callsValid) return;
    const sessionPolicy = activeSessionKey?.policy;
    if (txIsSession && gasMode !== 'free') {
      setError('Session keys can only send sponsored (free) transactions. Switch gas to Sponsored.');
      return;
    }
    if (txIsSession && !acct.deployed && !activeSessionKey?.pendingAuth) {
      setError('Authorize this session key with an owner key first (Apply now).');
      return;
    }
    setSigning(true);
    setError('');
    setInfoMsg('');
    setSeqRecovery(null);
    // Clear any prior "would revert" block; a fresh estimate re-sets it if needed.
    setEstimateBlocked(null);
    blockOnRevertRef.current = true; // transact send: surface a reverting estimate
    // Captured for sequence-mismatch recovery in the catch (what this tx carried).
    let seqCtx: { sessionIds: string[]; hasOwner: boolean } = { sessionIds: [], hasOwner: false };
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
      seqCtx = {
        sessionIds: bundle.flatMap((i) => (i.sessionId ? [i.sessionId] : [])),
        hasOwner: bundle.some((i) => i.resultingOwners),
      };
      const presigned = bundle.map((i) => i.change);
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
      if (handleSeqMismatch(err, seqCtx)) return false;
      const e = err as { message?: string; name?: string };
      const msg = e.message ?? String(err);
      setError(
        conciseError(
          e.name === 'NotAllowedError'
            ? 'Signature was dismissed.'
            : /fetch|ECONNREFUSED|network/i.test(msg)
              ? `Couldn't reach the payer service at ${PAYER_URL}.`
              : msg,
        ),
      );
      return false;
    } finally {
      setSigning(false);
      setSubmitStatus('');
      overrideEstimateRef.current = false; // one-shot "Send anyway"
      blockOnRevertRef.current = false;
    }
  };

  const confirmSend = async () => {
    setError('');
    const ok = await (gasMode === 'eth' ? doSignNative() : doSponsoredSign());
    if (ok !== false) setReviewOpen(false);
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
      // Owner (actor) changes live on the GLOBAL multichain config counter
      // (configChainId 0) so they sequence independently of session-key
      // authorizes (per-chain local counter) — a pending session key can't shift
      // this sequence, and vice versa.
      const chainId = 0;
      let nextSeq: number;
      if (acct.deployed) {
        // Read the live multichain sequence — never guess (fetch throws on failure).
        const { multichain } = await fetchOnChainConfigSeq(changeAccount.address as Address);
        nextSeq = multichain;
      } else {
        // Undeployed: the first-tx `create`/`delegation` change rides the SAME tx
        // and does NOT consume the multichain counter, so the bundled owner change
        // is sequence 0. `configSeq` is always 0 while undeployed, so it's the
        // correct base here (no `+ 1`, which caused a sequence mismatch).
        nextSeq = acct.configSeq;
      }
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
      if (handleSeqMismatch(err, { sessionIds: [], hasOwner: true })) return;
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
    // independent of owner changes (multichain counter). Offset only by OTHER
    // pending session-key authorizes (same counter) so stacked keys get
    // consecutive local sequences; a pending owner change is on a different
    // counter and must NOT shift this one.
    const chainId = skChain.id || 84532;
    const seqOffset = pendingChangeCount({ includeOwner: false });
    let nextSeq: number;
    if (acct.deployed) {
      // Read the live local sequence — never guess (fetch throws on failure).
      const { local } = await fetchOnChainConfigSeq(account.address as Address);
      nextSeq = local + seqOffset;
    } else {
      // Undeployed: the first-tx deploy change (`createAccount`/`importAccount`)
      // sets the LOCAL sequence to 1 (doubles as the "initialized" flag), so the
      // FIRST local-channel authorize is sequence 1 (POST_CREATE_LOCAL_SEQ), NOT 0
      // — whether it rides the deploy tx or a later tx after a separate deploy.
      nextSeq = POST_CREATE_LOCAL_SEQ + seqOffset;
    }

    // Register the manager as a trusted-executor actor on first use so its
    // executeBatch callback into the account succeeds (skip if already trusted).
    const configChanges = [
      authorizeActor(
        { actorId: target.actorId, authenticator: target.authenticator },
        { scope, expiry, policy: actorPolicy },
      ),
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
    if (!acct.deployed) accountChanges.push(firstDeployChange(acct, account));
    const configChange = await account.change(configChanges, { chainId, sequence: nextSeq });
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
    let nonceSeqSk: bigint;
    try {
      nonceSeqSk = await getTransactionCount8130(makeRpcClient(), {
        address: account.address as Address,
        nonceKey: 0n,
      });
    } catch {
      nonceSeqSk = acct.deployed ? 1n : 0n;
    }
    const skSenderAuthAuthenticator: Address =
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
            deploy: !acct.deployed,
            calls: 0,
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
  // Apply a staged session-key change now: an owner signs a no-op tx carrying its
  // authorize + install (plus lower-sequence prerequisites) — or its staged revoke.
  const applySessionKeyNow = async (skId: string) => {
    if (!acct || !activeSigner) return;
    const sk = acct.sessionKeys.find((x) => x.id === skId);
    if (!sk || (!sk.pendingAuth && !sk.pendingRevoke)) return;
    const isRevoke = !!sk.pendingRevoke && !sk.pendingAuth;
    const txWS =
      postChangeOwnerSigners.find((s) => s.id === activeSignerId) ??
      postChangeOwnerSigners[0] ??
      activeSigner;
    const bundle = pendingBundleFor({ mode: 'session-send', sessionId: sk.id });
    const presigned = bundle.map((i) => i.change);
    const changeSeq = bundle.length
      ? bundle[bundle.length - 1].sequence
      : (sk.pendingAuth?.sequence ?? sk.pendingRevoke?.sequence ?? null);
    setSkApplyingId(sk.id);
    setError('');
    setInfoMsg('');
    setSeqRecovery(null);
    try {
      const { serialized, nextSeq } = await signComposed(
        acct,
        txWS,
        [newCallRow()],
        presigned,
        changeSeq,
        undefined,
        undefined,
        undefined,
      );
      const txHash = await broadcast8130(serialized, setSubmitStatus);
      applyLandedBundle(acct, nextSeq, bundle);
      setConfigTx({ hash: txHash, label: `Session key: ${sk.label}` });
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
    } catch (err) {
      if (
        handleSeqMismatch(err, {
          sessionIds: bundle.flatMap((i) => (i.sessionId ? [i.sessionId] : [])),
          hasOwner: bundle.some((i) => i.resultingOwners),
        })
      )
        return;
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      setSkApplyingId(null);
      setSubmitStatus('');
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
  const revokeSessionKey = async (
    id: string,
  ): Promise<'discarded' | 'staged' | 'noop' | 'error'> => {
    if (!acct) return 'error';
    const sk = acct.sessionKeys.find((x) => x.id === id);
    if (!sk) return 'error';

    // Never-landed or undeployed → nothing on-chain to revoke; discard locally.
    if (sk.pendingAuth || !acct.deployed) {
      updateAccount(acct.id, (a) => ({ ...a, sessionKeys: a.sessionKeys.filter((x) => x.id !== id) }));
      pushActivity({
        kind: 'revoke',
        title: `Session key discarded · ${sk.label}`,
        detail: scopeChips(sk.scope).join(' · '),
        account: acct.address,
      });
      return 'discarded';
    }

    // Already staged — no-op (use "Apply now" to land it, or "Undo" to discard).
    if (sk.pendingRevoke) return 'noop';

    const changeWS =
      ownerSigners.find((s) => s.id === activeSignerId) ?? ownerSigners[0] ?? activeSigner;
    if (!changeWS) {
      setError('Select an owner key to sign the revoke.');
      return 'error';
    }
    setSkRevokingId(id);
    setError('');
    try {
      const changeSigner = await buildSigner(changeWS);
      const changeAccount = nativeAccountFor(acct, changeSigner, changeWS.authenticator);
      // Session-key changes are on the per-chain LOCAL counter. Read it live (throws
      // on failure — never guess) and offset by other pending local changes.
      const chainId = chain.id || 84532;
      const seqOffset = pendingChangeCount({ includeOwner: false });
      const { local } = await fetchOnChainConfigSeq(changeAccount.address as Address);
      const nextSeq = local + seqOffset;
      const change = await changeAccount.change([revokeActor(sk.actorId)], {
        chainId,
        sequence: nextSeq,
      });
      updateAccount(acct.id, (a) => ({
        ...a,
        sessionKeys: a.sessionKeys.map((x) =>
          x.id === id ? { ...x, pendingRevoke: { change, sequence: nextSeq } } : x,
        ),
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
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
      return 'error';
    } finally {
      setSkRevokingId(null);
    }
  };

  // Unsubscribe from a session-key app card. Revoking a landed key is a config
  // change that must be signed AND applied on-chain, so once it's staged we open
  // the account modal on the Session Keys tab — making the required "Apply now"
  // step obvious rather than silently leaving a pending revoke. (A never-landed
  // key is just discarded, so there's nothing to apply and no modal to open.)
  const unsubscribeApp = async (sk: AppSessionKey) => {
    const outcome = await revokeSessionKey(sk.id);
    if (outcome === 'staged' || outcome === 'noop') {
      setCfgTab('session');
      setDetailsOpen(true);
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
      setError('Select an owner key to re-sign the session-key authorization.');
      return false;
    }
    const ownerSigner = await buildSigner(signerWS);
    const account = nativeAccountFor(acct, ownerSigner, signerWS.authenticator);
    // Fresh base: live local counter when deployed, else the post-create local seq.
    let base: number;
    if (acct.deployed) {
      const { local } = await fetchOnChainConfigSeq(account.address as Address);
      base = local;
    } else {
      base = POST_CREATE_LOCAL_SEQ;
    }
    // Re-sign in current-sequence order so relative ordering is preserved.
    const ordered = [...pending].sort(
      (a, b) => (a.pendingAuth?.sequence ?? 0) - (b.pendingAuth?.sequence ?? 0),
    );
    const updates = new Map<string, NonNullable<AppSessionKey['pendingAuth']>>();
    // Managers registered within THIS batch — so two keys sharing one manager don't
    // both try to register it (the second would revert).
    const registeredInBatch = new Set<string>();
    let offset = 0;
    for (const sk of ordered) {
      if (!sk.policy || !sk.pendingAuth) continue;
      const skChainId = sk.chainId ?? (chain.id || 84532);
      const seq = base + offset;
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
        authorizeActor(
          { actorId: sk.actorId, authenticator: sk.authenticator },
          { scope: sk.scope, expiry: sk.expiry, policy: session.actorPolicy },
        ),
      ];
      let registeredManager = false;
      if (!managerTrusted) {
        configChanges.unshift(authorizeActor(key.trustedExecutor(sk.policy.manager), { scope: SCOPE.sender }));
        registeredManager = true;
        registeredInBatch.add(managerLc);
      }
      const change = await account.change(configChanges, { chainId: skChainId, sequence: seq });
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

  // Catch a "config change sequence mismatch" from a config-carrying broadcast and
  // surface a recovery prompt (re-sign at current sequence / drop), scoped to what
  // the failed tx carried. Returns true when it handled the error (caller should
  // skip its own generic error handling).
  const handleSeqMismatch = (err: unknown, ctx: { sessionIds: string[]; hasOwner: boolean }): boolean => {
    if (!isSeqMismatch(err)) return false;
    if (!ctx.hasOwner && ctx.sessionIds.length === 0) return false;
    const parts: string[] = [];
    if (ctx.hasOwner) parts.push('owner change');
    if (ctx.sessionIds.length)
      parts.push(`${ctx.sessionIds.length} session-key authorization${ctx.sessionIds.length === 1 ? '' : 's'}`);
    const what = parts.join(' + ') || 'staged config change';
    setError('');
    setInfoMsg('');
    setSeqRecovery({
      what,
      resign: async () => {
        setSeqRecovery((r) => (r ? { ...r, busy: true } : r));
        setError('');
        try {
          if (ctx.hasOwner) await signOwnerChange();
          if (ctx.sessionIds.length) {
            const ok = await resignPendingSessionKeys();
            if (!ok) {
              setSeqRecovery((r) => (r ? { ...r, busy: false } : r));
              return;
            }
          }
          setSeqRecovery(null);
          setInfoMsg('Re-signed at the current sequence — send again to apply it.');
        } catch (e) {
          const m = e as { message?: string; name?: string };
          setSeqRecovery((r) => (r ? { ...r, busy: false } : r));
          setError(m.name === 'NotAllowedError' ? 'Signature was dismissed.' : (m.message ?? String(e)));
        }
      },
      drop: () => {
        if (ctx.hasOwner) discardOwnerChanges();
        if (ctx.sessionIds.length) dropPendingSessionKeys(ctx.sessionIds);
        setSeqRecovery(null);
        setInfoMsg('Dropped the out-of-sequence config change.');
      },
    });
    return true;
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
    // Track the freshly minted app key so we can discard it if the authorize tx
    // never lands — `mintAppKey` persists the signer up front, and `commit()`
    // (below) is what actually marks the account subscribed/deployed. Cleared
    // only once the tx has landed and been committed.
    let mintedKeyId: string | null = null;
    try {
      const target = mintAppKey(app.name);
      if (!target) {
        setError("Couldn't mint an app key — try again.");
        return;
      }
      mintedKeyId = target.id;
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
        // broadcast8130 throws on an on-chain/phase revert or timeout, so we only
        // reach commit() when the authorize+install actually landed.
        const txHash = await broadcast8130(sk.serialized, setSubmitStatus);
        sk.commit?.();
        mintedKeyId = null;
        setConfigTx({ hash: txHash, label: `Connected: ${app.name}` });
      }
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      // Revert/timeout/dismiss (or a null sign result): drop the orphaned app key
      // so the card stays on "Subscribe" and no stray signer lingers.
      if (mintedKeyId) setSigners((prev) => prev.filter((s) => s.id !== mintedKeyId));
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
    <div className="relative -mb-20 flex flex-1 flex-col gap-10 pb-4 text-black dark:text-white">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-6">{renderAccount()}</div>
          <DemoKeys
            signers={signers}
            busy={busy}
            renameId={renameId}
            setRenameId={setRenameId}
            createSigner={createSigner}
            renameSigner={renameSigner}
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* `initial={false}`: the crossfade is for switching, not first paint. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeAccountId ?? 'empty'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col gap-6"
            >
              {renderTransact()}
              {renderApps()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[12px]">
        <a href={SPEC_URL} target="_blank" rel="noopener" className="text-bds-gray-50 transition-colors hover:text-bds-gray-70 dark:text-bds-gray-40 dark:hover:text-bds-gray-30">
          Spec ↗
        </a>
        <a href={CONTRACTS_URL} target="_blank" rel="noopener" className="text-bds-gray-50 transition-colors hover:text-bds-gray-70 dark:text-bds-gray-40 dark:hover:text-bds-gray-30">
          Contracts ↗
        </a>
      </div>

      {error && !estimateBlocked ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70 dark:border-bds-red-80 dark:bg-bds-red-100/40 dark:text-bds-red-20"
        >
          <span className="[line-break:anywhere]">{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            aria-label="Dismiss error"
            className="shrink-0 text-[12px] text-bds-red-60 hover:text-bds-red-70 dark:text-bds-red-30"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {estimateBlocked ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70 dark:border-bds-red-80 dark:bg-bds-red-100/40 dark:text-bds-red-20"
        >
          <span className="[line-break:anywhere]">{conciseError(estimateBlocked)}</span>
          <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
            Estimation reverted, so this will likely fail on-chain.
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => copy(estimateBlocked, 'estimate-error')}>
              {copied === 'estimate-error' ? 'Copied' : 'Copy Error'}
            </Button>
            <Button
              size="sm"
              disabled={signing}
              onClick={() => {
                overrideEstimateRef.current = true;
                void confirmSend();
              }}
            >
              Send Anyway
            </Button>
          </div>
        </div>
      ) : null}

      {seqRecovery ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-bds-yellow-20 bg-bds-yellow-0 px-4 py-3 text-[13px] text-bds-yellow-70 dark:border-bds-yellow-80 dark:bg-bds-yellow-100/30"
        >
          <span>
            This {seqRecovery.what} is out of sequence — the account&apos;s config changed since it was
            signed, so it can&apos;t land as-is. Re-sign it at the current sequence, or drop it.
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => seqRecovery.resign()} disabled={seqRecovery.busy}>
              {seqRecovery.busy ? 'Re-Signing…' : 'Re-Sign'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => seqRecovery.drop()} disabled={seqRecovery.busy}>
              Drop It
            </Button>
          </div>
        </div>
      ) : null}

      {infoMsg ? (
        <p
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-4 py-3 text-[13px] text-bds-gray-70 dark:border-white/10 dark:bg-white/5 dark:text-bds-gray-20"
        >
          <span>{infoMsg}</span>
          <button
            type="button"
            onClick={() => setInfoMsg('')}
            className="shrink-0 text-[12px] text-bds-gray-60 hover:text-bds-gray-70 dark:text-bds-gray-40"
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {/* Activity — full main-panel width, sticky bottom.
          `mt-auto` pushes the bar to the bottom of the (full-height) flex column
          so it rests at the true viewport bottom on short/zoomed-out pages, while
          `sticky bottom-0` keeps it pinned once the content is tall enough to scroll. */}
      <div
        className="activity-full-width sticky bottom-0 z-10 mt-auto"
      >
        <div className="border-t border-bds-gray-10 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={() => setActivityOpen(!activityOpen)}
            className="group flex w-full items-center justify-between px-5 py-4"
          >
            <Text variant="headline" className="flex items-center gap-2">
              Activity
              <AnimatePresence>
                {activity.length > 0 && (
                  <motion.span
                    key="activity-count"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-bds-gray-10 text-[13px] font-normal text-bds-gray-50 dark:bg-white/10"
                  >
                    {activity.length}
                  </motion.span>
                )}
              </AnimatePresence>
            </Text>
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-bds-gray-50">
              <path d={activityOpen ? 'M5 12.5L10 7.5L15 12.5' : 'M5 7.5L10 12.5L15 7.5'} />
            </svg>
          </button>
          <AnimatePresence initial={false}>
            {activityOpen && (
              <motion.div
                key="activity-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="overflow-hidden"
              >
                <div className="max-h-[280px] overflow-y-auto px-5 pb-5">
                  {activity.length > 0 ? (
                    <ActivityLog activity={activity} accounts={accounts} />
                  ) : (
                    <Text variant="label.regular" tone="muted" className="py-4 text-center">
                      No activity yet. Transactions and account changes will appear here.
                    </Text>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>


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
        title="Review Transaction"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setReviewOpen(false); setError(''); }} disabled={signing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={confirmSend}
              disabled={signing}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signing ? (submitStatus || 'Signing…') : error ? 'Retry' : 'Sign & Send'}
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
            error={error}
            signing={signing}
          />
        ) : null}
      </Modal>

      <Modal
        open={clearConfirm}
        onClose={() => setClearConfirm(false)}
        title="Clear All Accounts?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setClearConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={clearAllData} className="bg-bds-red-60 hover:bg-bds-red-70">
              Clear Everything
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
        title="Chain Was Reset"
        footer={
          <Button variant="primary" size="sm" onClick={() => setRegenesisNotice(false)}>
            Got It
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
    // One selectable account card. Reused for top-level accounts and, indented,
    // for their delegated sub-accounts (grouped below their parent).
    const acctButton = (a: StoredAccount) => (
      <motion.div
        key={a.id}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveAccountId(a.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveAccountId(a.id); } }}
          className={cn(
            'flex w-full cursor-pointer flex-col gap-3 rounded-xl border-[1.5px] p-4 text-left transition-colors sm:flex-row sm:items-center',
            a.id === activeAccountId
              ? 'border-black dark:border-white'
              : 'border-bds-gray-10 bg-white hover:border-black dark:border-white/10 dark:bg-white/5 dark:hover:border-white',
          )}
        >
          <AccountIdentity
            label={a.label}
            address={a.address}
            variant={a.parentId ? 'spending' : 'default'}
            badges={a.deployed ? <Badge tone="ok">Deployed</Badge> : undefined}
            className="min-w-0 flex-1"
          />
          {a.id === activeAccountId && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDetailsOpen(true); }}
              >
                Details
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); requestFaucet(); }}
                disabled={faucetBusy !== null}
              >
                {faucetBusy ? <Spinner /> : 'Top Up'}
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    );
    const topLevel = accounts.filter((a) => !a.parentId);
    return (
      <>
        {accounts.length === 0 ? (
          <Card className="flex flex-col items-center gap-4 bg-white px-6 py-12 text-center dark:bg-white/5">
            <Text variant="label.medium">No accounts yet</Text>
            <Text variant="label.regular" tone="muted" className="max-w-sm">
              Create an account from one or more signer keys. You&apos;ll get a portable address you
              can fund and transact with anywhere.
            </Text>
            <Button size="sm" onClick={openCreate}>Create Account</Button>
          </Card>
        ) : (
          <>
            <Card className="flex flex-col gap-3 bg-white p-5 dark:bg-white/5">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <Text variant="headline">Accounts</Text>
                  <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setClearConfirm(true)}>
                    Clear
                  </Button>
                </div>
                <Text variant="label.regular" tone="muted">Select an account to start testing transacting and performing app actions.</Text>
              </div>
              {topLevel.map((parent) => {
                const subs = accounts.filter((s) => s.parentId === parent.id);
                return (
                  <div key={parent.id} className="flex flex-col gap-2">
                    {acctButton(parent)}
                    {subs.length > 0 ? (
                      <div className="ml-4 flex flex-col gap-2 border-l border-bds-gray-10 pl-3 dark:border-white/10">
                        {subs.map((sub) => acctButton(sub))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-bds-gray-15 px-4 py-2.5 text-[14px] text-bds-gray-60 transition-colors hover:border-base-blue hover:text-base-blue dark:border-white/15 dark:text-bds-gray-40 dark:hover:border-bds-blue-60"
              >
                + New Account
              </button>
            </Card>

            <Modal
              open={detailsOpen && !!acct}
              onClose={() => setDetailsOpen(false)}
              title="Account Details"
              className="max-w-lg"
            >
              {acct ? (
                <ConfigView
                  acct={acct}
                  copied={copied}
                  copy={copy}
                  cfgTab={cfgTab}
                  setCfgTab={setCfgTab}
                  explorerHref={explorerAddrHref}
                  onTransact={() => { setDetailsOpen(false); setTransactModalOpen(true); }}
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
                  undoStagedRevoke={undoStagedRevoke}
                  skRevokingId={skRevokingId}
                  saLabel={saLabel}
                  setSaLabel={setSaLabel}
                  saBusy={saBusy}
                  createSubAccount={createSubAccount}
                />
              ) : null}
            </Modal>
          </>
        )}
      </>
    );
  }

  function renderApps() {
    if (!acct) return (
      <Card className="flex flex-col items-center gap-3 bg-white px-6 py-12 text-center dark:bg-white/5">
        <Text variant="headline">Apps</Text>
        <Text variant="label.regular" tone="muted">Create and select an account to connect apps.</Text>
      </Card>
    );
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
        unsubscribeApp={unsubscribeApp}
      />
    );
  }

  function renderTransact() {
    if (!acct) return (
      <Card className="flex flex-col items-center gap-3 bg-white px-6 py-12 text-center dark:bg-white/5">
        <Text variant="headline">Transact</Text>
        <Text variant="label.regular" tone="muted">Create and select an account to transact.</Text>
      </Card>
    );
    return (
      <>
        <Card className="flex flex-col gap-4 bg-white p-5 dark:bg-white/5">
          <Text variant="headline">Transact</Text>
          <Text variant="label.regular" tone="muted" className="-mt-2">
            Compose and send EIP-8130 transactions from your account.
          </Text>
          <div>
            <Button size="sm" onClick={() => setTransactModalOpen(true)}>
              Create Transaction
            </Button>
          </div>
        </Card>

        <Modal
          open={transactModalOpen}
          onClose={() => setTransactModalOpen(false)}
          title="Create Transaction"
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              <span className="text-[12px] text-bds-gray-50 dark:text-bds-gray-40">
                {chain.mode === 'eip8130-native' ? 'native 8130' : 'ERC-4337'} · 1 tx · ~
                {gasEstimate.toLocaleString()} gas
                {!acct.deployed
                  ? acct.type === 'eoa'
                    ? ' · first use delegates your EOA'
                    : ' · first use deploys your account'
                  : ''}
              </span>
              <Button
                size="sm"
                onClick={startSend}
                disabled={!callsValid || !txSigner || signing}
                className="disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitStatus === 'submitting'
                  ? 'Submitting…'
                  : submitStatus === 'confirming'
                    ? 'Waiting for confirmation…'
                    : 'Send Transaction'}
              </Button>
            </div>
          }
        >
          {/* From */}
          <div className="flex flex-col gap-3">
            <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">From</span>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => copy(acct.address, 'txaddr')}
                title="Copy address"
                className="flex items-center gap-3"
              >
                <AccountAvatar />
                <span className="flex flex-col text-left">
                  <span className="text-[14px] font-normal">{acct.label}</span>
                  <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                    {copied === 'txaddr' ? 'Copied' : short(acct.address)}
                    {balances?.eth_wei ? ` · ${(Number(balances.eth_wei) / 1e18).toFixed(4)} ETH` : ''}
                  </span>
                </span>
              </button>
              {networkShort === 'vibenet' ? (
                <Button variant="secondary" size="sm" onClick={requestFaucet} disabled={faucetBusy !== null}>
                  {faucetBusy ? <Spinner /> : 'Top Up'}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Signer */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Signer</span>
            {signableSigners.length > 1 ? (
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
            ) : (
              <span className="flex items-center gap-1.5 text-[14px] font-normal">
                {txSigner?.label}
                {txSigner ? <KindBadge kind={txSigner.kind} /> : null}
              </span>
            )}
          </div>

          {DEMO_CHAINS.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Network</span>
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
          ) : null}

          {/* Calls */}
          <div className="rounded-lg border border-bds-gray-10 px-4 pb-4 pt-2 dark:border-white/10">
            <CallsEditor
              calls={calls}
              callsAdvanced={callsAdvanced}
              setCallsAdvanced={setCallsAdvanced}
              setRow={setRow}
              addEthRow={addEthRow}
              addUsdvRow={addUsdvRow}
              removeRow={removeRow}
              usdvRecipientDrafts={usdvRecipientDrafts}
              setUsdvRecipientDrafts={setUsdvRecipientDrafts}
              usdvAmountDrafts={usdvAmountDrafts}
              setUsdvAmountDrafts={setUsdvAmountDrafts}
              callsValid={callsValid}
              addRow={addRow}
              copyRandomAddress={copyRandomAddress}
              randCopied={copied === 'randaddr'}
            />
          </div>

          {/* Metadata */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Metadata</span>
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Top-Level · Signed</span>
            </div>
            <input
              value={metaField}
              spellCheck={false}
              placeholder="Optional note / app data — e.g. invoice #4242"
              onChange={(e) => setMetaField(e.target.value)}
              className="w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3.5 py-2.5 text-[14px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-black dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40"
            />
            {metadataHex ? (
              <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                → <span className="font-sans">{short(metadataHex, 14, 8)}</span>
              </p>
            ) : null}
          </div>

          {/* Gas */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Gas</span>
            <Select
              ariaLabel="Gas payment"
              value={gasMode}
              onValueChange={(v) => setGasMode(v as 'eth' | 'free' | 'usdv')}
              options={
                txIsSession
                  ? [{ value: 'free', label: 'Sponsored (EIP-8168)' }]
                  : [
                      { value: 'eth', label: 'Pay in ETH' },
                      { value: 'free', label: 'Sponsored (EIP-8168)' },
                      { value: 'usdv', label: 'Pay in USDV (EIP-8168)' },
                    ]
              }
            />
            {txIsSession ? (
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                Session keys can only send sponsored transactions.
              </span>
            ) : null}
          </div>
        </Modal>
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
  usdvRecipientDrafts: Record<string, string>;
  setUsdvRecipientDrafts: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  usdvAmountDrafts: Record<string, string>;
  setUsdvAmountDrafts: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  callsValid: boolean;
  addRow: (partial?: Partial<CallRow>) => void;
  copyRandomAddress: () => void;
  randCopied: boolean;
};

const INPUT_CLS =
  'w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-black dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40';

function CallsEditor(props: CallsEditorProps) {
  const {
    calls,
    callsAdvanced,
    setCallsAdvanced,
    setRow,
    addEthRow,
    addUsdvRow,
    removeRow,
    usdvRecipientDrafts,
    setUsdvRecipientDrafts,
    usdvAmountDrafts,
    setUsdvAmountDrafts,
    callsValid,
    addRow,
    copyRandomAddress,
    randCopied,
  } = props;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Text variant="label" className="font-normal">
            Calls
          </Text>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bds-gray-10 px-1.5 font-base text-[11px] font-medium tabular-nums text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-40">
            {calls.length}
          </span>
        </div>
        <Tabs
          size="sm"
          items={[
            { value: 'simple', label: 'Simple' },
            { value: 'raw', label: 'Raw' },
          ]}
          value={callsAdvanced ? 'raw' : 'simple'}
          onChange={(v) => setCallsAdvanced(() => v === 'raw')}
        />
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
                  <li key={r.id} className="flex items-center gap-2">
                    <label className="flex flex-1 flex-col">
                      <div className="flex items-center overflow-hidden rounded-lg border border-bds-gray-10 bg-bds-gray-0 transition-colors focus-within:border-black dark:border-white/10 dark:bg-white/5 dark:focus-within:border-white">
                        <span className="shrink-0 pl-3 text-[11px] text-bds-gray-40">Recipient</span>
                        <input
                          className="w-full bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-bds-gray-40"
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
                      </div>
                    </label>
                    <label className="flex w-28 flex-col">
                      <div className="flex items-center overflow-hidden rounded-lg border border-bds-gray-10 bg-bds-gray-0 transition-colors focus-within:border-black dark:border-white/10 dark:bg-white/5 dark:focus-within:border-white">
                        <span className="shrink-0 pl-3 text-[11px] text-bds-gray-40">USDV</span>
                        <input
                          className="w-full bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-bds-gray-40"
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
                      </div>
                    </label>
                    {calls.length > 1 && <RemoveRowButton onClick={() => removeRow(r.id)} disabled={false} />}
                  </li>
                );
              }
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <label className="flex flex-1 flex-col">
                    <div className="flex items-center overflow-hidden rounded-lg border border-bds-gray-10 bg-bds-gray-0 transition-colors focus-within:border-black dark:border-white/10 dark:bg-white/5 dark:focus-within:border-white">
                      <span className="shrink-0 pl-3 text-[11px] text-bds-gray-40">To</span>
                      <input
                        className="w-full bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-bds-gray-40"
                        value={r.to}
                        spellCheck={false}
                        placeholder="0x… recipient address"
                        onChange={(e) => setRow(r.id, { to: e.target.value })}
                      />
                    </div>
                  </label>
                  <label className="flex w-28 flex-col">
                    <div className="flex items-center overflow-hidden rounded-lg border border-bds-gray-10 bg-bds-gray-0 transition-colors focus-within:border-black dark:border-white/10 dark:bg-white/5 dark:focus-within:border-white">
                      <span className="shrink-0 pl-3 text-[11px] text-bds-gray-40">ETH</span>
                      <input
                        className="w-full bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-bds-gray-40"
                        value={r.value}
                        spellCheck={false}
                        inputMode="decimal"
                        placeholder="0.0"
                        onChange={(e) => setRow(r.id, { value: e.target.value })}
                      />
                    </div>
                  </label>
                  {calls.length > 1 && <RemoveRowButton onClick={() => removeRow(r.id)} disabled={false} />}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Add Call:</span>
            <Button variant="secondary" size="sm" onClick={addEthRow}>
              Send ETH
            </Button>
            <Button variant="secondary" size="sm" onClick={addUsdvRow}>
              Send USDV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={copyRandomAddress}
              title="Generate a random address and copy it to the clipboard"
            >
              {randCopied ? 'Copied ✓' : '⧉ Random address'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            <li
              className="hidden items-center gap-2 px-1 text-[11px] tracking-[0.4px] text-bds-gray-50 sm:flex"
              aria-hidden="true"
            >
              <span className="w-12 text-left">Phase</span>
              <span className="flex-1">Send to</span>
              <span className="w-24">ETH</span>
              <span className="flex-1">Calldata (hex)</span>
              <span className="w-7" />
            </li>
            {calls.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => setRow(r.id, { phase: r.phase === 0 ? 1 : 0 })}
                  title={
                    r.phase === 0
                      ? 'Phase 0 — runs before phase 1 (click to move to phase 1)'
                      : 'Phase 1 — main user calls (click to move to phase 0)'
                  }
                  className={cn(
                    'w-12 shrink-0 rounded-md border py-2 text-[12px] font-normal',
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
                  placeholder="Contract / address"
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
                  className={cn(INPUT_CLS, 'flex-1 font-sans')}
                  value={r.data}
                  spellCheck={false}
                  placeholder="0x"
                  onChange={(e) => setRow(r.id, { data: e.target.value })}
                />
                {calls.length > 1 && <RemoveRowButton onClick={() => removeRow(r.id)} disabled={false} />}
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
    </div>
  );
}

function RemoveRowButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Remove call"
      className="mb-0.5 flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-bds-gray-50 transition-colors hover:text-bds-red-60 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <CloseIcon size={10} />
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
  error: string;
  signing: boolean;
};

function ReviewBody({ acct, calls, metaField, chain, gasMode, gasEstimate, txSigner, error, signing }: ReviewBodyProps) {
  const gasLabel =
    gasMode === 'eth' ? 'Pay in ETH' : gasMode === 'free' ? 'Free · sponsored' : 'USDV · payer';
  return (
    <div className="flex flex-col gap-4">
      {!acct.deployed ? (
        <div className="flex items-start gap-2 rounded-lg border border-bds-blue-15 bg-bds-blue-0 p-3 text-[13px] dark:border-bds-blue-80 dark:bg-bds-blue-100/30">
          <Badge>{acct.type === 'eoa' ? 'Delegate' : 'Deploy'}</Badge>
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
            <span className="font-sans text-bds-gray-70 dark:text-bds-gray-20">
              {short(r.to.trim() || acct.address)}
            </span>
            {r.value.trim() && r.value.trim() !== '0' ? (
              <span className="font-normal">{r.value} ETH</span>
            ) : null}
            {r.data.trim() && r.data.trim() !== '0x' ? (
              <span className="font-sans text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                {short(r.data.trim(), 8, 4)}
              </span>
            ) : null}
          </li>
        ))}
        {metaField.trim() ? (
          <li className="flex items-center gap-2 text-[13px]">
            <Badge>Meta</Badge>
            {metaField.trim()}
          </li>
        ) : null}
      </ul>

      <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-3 text-[13px] dark:border-white/10">
        {error ? (
          <div className="flex items-start gap-2 py-1 text-[13px] text-bds-red-60 [line-break:anywhere] dark:text-bds-red-30">
            <svg width={16} height={16} viewBox="0 0 40 40" fill="none" className="mt-px shrink-0" aria-hidden="true">
              <circle cx="20" cy="24.5" r="1" fill="currentColor" stroke="currentColor" />
              <path d="M20 15V20M30.5 20C30.5 25.799 25.799 30.5 20 30.5C14.201 30.5 9.5 25.799 9.5 20C9.5 14.201 14.201 9.5 20 9.5C25.799 9.5 30.5 14.201 30.5 20Z" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            </svg>
            {error}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-bds-gray-60 dark:text-bds-gray-40">
              <span className="text-black dark:text-white">
                {chain.mode === 'eip8130-native' ? 'native 8130' : 'ERC-4337'}
              </span>{' '}
              · 1 tx · ~{gasEstimate.toLocaleString()} gas · {gasLabel}
            </span>
            {txSigner ? (
              <span className="flex items-center gap-1.5">
                <span className="text-bds-gray-60 dark:text-bds-gray-40">signing</span>
                <KindBadge kind={txSigner.kind} />
                <span className="font-normal">{txSigner.label}</span>
              </span>
            ) : null}
          </div>
        )}
      </div>
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
    <Card className="flex flex-col gap-4 overflow-hidden bg-white p-5 dark:bg-white/5">
      <Text variant="headline">
        Demo Keys
      </Text>
      <div className="flex flex-wrap gap-2">
        {(['k1', 'p256', 'passkey'] as const).map((kind) => (
          <Button key={kind} variant="secondary" size="sm" onClick={() => createSigner(kind)} disabled={busy !== null}>
            {busy === kind ? <Spinner /> : `+ ${KIND_LABEL[kind]}`}
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
            <li key={s.id} className="flex flex-col gap-0.5 rounded-lg border border-bds-gray-10 p-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                {renameId === s.id ? (
                  <input
                    autoFocus
                    defaultValue={s.label}
                    onBlur={(e) => renameSigner(s.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameSigner(s.id, (e.target as HTMLInputElement).value);
                      if (e.key === 'Escape') setRenameId(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-bds-gray-10 bg-bds-gray-0 px-1.5 py-0.5 text-[13px] outline-none focus:border-black dark:border-white/10 dark:bg-white/5"
                  />
                ) : (
                  <button
                    type="button"
                    title="Rename key"
                    onClick={() => setRenameId(s.id)}
                    className="group flex min-w-0 flex-1 items-center gap-1 text-left text-[13px] font-normal"
                  >
                    <span className="truncate">{s.label}</span>
                    <span aria-hidden="true" className="text-bds-gray-40 opacity-0 transition-opacity group-hover:opacity-100">
                      ✎
                    </span>
                  </button>
                )}
                <KindBadge kind={s.kind} />
              </div>
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                {short(signerIdentity(s))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="-mx-5 -mb-5 rounded-b-[11px] border-t border-bds-gray-10 bg-bds-gray-5 px-5 py-3 dark:border-white/10 dark:bg-white/5">
        <Text variant="footnote" tone="muted">
          Keys live in this browser only. Do not reuse these or send real assets.
        </Text>
      </div>
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
      title="Create Account"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={createAccount}
            disabled={!modalAddress}
            className="disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create Account
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-2 text-[14px] font-normal">
        Label
        <input
          value={modalLabel}
          placeholder="E.g. Main account"
          onChange={(e) => setModalLabel(e.target.value)}
          className="w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3.5 py-2.5 text-[14px] font-normal outline-none transition-colors placeholder:text-bds-gray-40 focus:border-black dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40"
        />
      </label>

      <div className="flex flex-col gap-2 text-[14px] font-normal">
        Account type
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['smart', 'Smart Account', 'Counterfactual · keys + salt → address'],
              ['eoa', 'EOA', 'Your EOA · delegates to DefaultAccount'],
            ] as const
          ).map(([type, title, hint]) => (
            <button
              key={type}
              type="button"
              onClick={() => setModalType(type)}
              className={cn(
                'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                modalType === type
                  ? 'border-black dark:border-white'
                  : 'border-bds-gray-10 hover:border-black dark:border-white/10 dark:hover:border-white',
              )}
            >
              <span className="text-[14px] font-normal">{title}</span>
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
          <label className="flex flex-col gap-2 text-[14px] font-normal">
            Salt
            <div className="flex items-center gap-2 rounded-lg border border-bds-gray-10 bg-bds-gray-0 transition-colors focus-within:border-black dark:border-white/10 dark:bg-white/5 dark:focus-within:border-bds-blue-40">
              <input
                value={modalSalt}
                spellCheck={false}
                onChange={(e) => setModalSalt(e.target.value)}
                placeholder="0x… (32 bytes) or any phrase"
                className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 font-sans text-[13px] font-normal outline-none placeholder:text-bds-gray-40"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setModalSalt(randomHex32())}
                className="mr-1.5 shrink-0"
              >
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

      <div className="flex flex-col gap-1">
        <span className="text-[11px] tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">
          Address
        </span>
        {modalAddress ? (
          <span className="break-all font-sans text-[13px] text-black dark:text-white">
            {modalAddress}
          </span>
        ) : modalType === 'eoa' ? (
          <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Pick a K1 key</span>
        ) : modalSigners.length === 0 ? (
          <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Select at least one key</span>
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
        <Text variant="label" className="font-normal">
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
                    'flex w-full items-center gap-2 rounded-lg border px-2 py-2.5 text-left transition-colors',
                    on
                      ? 'border-black dark:border-white'
                      : 'border-bds-gray-10 hover:border-black dark:border-white/10 dark:hover:border-white',
                  )}
                >
                  <Text as="span" variant="label" className="truncate">{s.label}</Text>
                  <KindBadge kind={s.kind} />
                  <Text as="span" variant="caption" tone="muted" className="min-w-0 flex-1 text-right font-sans">
                    {short(signerIdentity(s))}
                  </Text>
                  <span className="flex w-4 items-center justify-center">
                    {on ? <CheckIcon size={16} /> : null}
                  </span>
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
