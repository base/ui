// App-level account model for the EIP-8130 demo: session keys, policies,
// sub-accounts, and a session activity log. These wrap the canonical viem
// primitives (`authorizeActor` scope/expiry/policy, `key.delegate`) into
// shapes the UI can render.

import type { AaAccountChangeConfig, Address, Hex } from "@aa";

// ---------------------------------------------------------------------------
// Scopes — mirror viem's `actorScope` bitmask.
// ---------------------------------------------------------------------------

export const SCOPE = {
  sender: 0x01,
  policy: 0x02,
  nonce: 0x04,
  selfPayer: 0x08,
  sponsorPayer: 0x10,
} as const;

const SCOPE_LABEL: Array<[number, string]> = [
  [SCOPE.sender, "Send"],
  [SCOPE.policy, "Policy"],
  [SCOPE.nonce, "Nonce"],
  [SCOPE.selfPayer, "Pay Gas"],
  [SCOPE.sponsorPayer, "Sponsor"],
];

/** Human-readable chips for a scope bitmask. `0` = unrestricted admin (full owner). */
export function scopeChips(scope: number): string[] {
  if (!scope) return ["Full control"];
  return SCOPE_LABEL.filter(([bit]) => (scope & bit) !== 0).map(([, l]) => l);
}

// ---------------------------------------------------------------------------
// Presets surfaced in the "register session key" UI.
// ---------------------------------------------------------------------------

export type ScopePreset = {
  id: string;
  label: string;
  scope: number;
  hint: string;
};

export const SESSION_SCOPE_PRESETS: ScopePreset[] = [
  {
    id: "spend",
    label: "Spend",
    scope: SCOPE.sender,
    hint: "Originate calls and move funds. Cannot change account config.",
  },
  {
    id: "self-pay",
    label: "Pay gas",
    scope: SCOPE.selfPayer,
    hint: "Pay for the account's own transactions (payer == sender).",
  },
  {
    id: "sponsor",
    label: "Sponsor",
    scope: SCOPE.sponsorPayer,
    hint: "Sponsor gas on behalf of another sender (payer != sender).",
  },
];

export type ExpiryPreset = { id: string; label: string; seconds: number };

export const EXPIRY_PRESETS: ExpiryPreset[] = [
  { id: "1h", label: "1 hour", seconds: 3600 },
  { id: "1d", label: "1 day", seconds: 86_400 },
  { id: "7d", label: "7 days", seconds: 604_800 },
  { id: "30d", label: "30 days", seconds: 2_592_000 },
  { id: "none", label: "No expiry", seconds: 0 },
];

export type PolicyPreset = {
  id: string;
  /** Non-zero policy selector (`0` = no policy). */
  type: number;
  label: string;
  hint: string;
};

export const POLICY_PRESETS: PolicyPreset[] = [
  {
    id: "none",
    type: 0,
    label: "No policy",
    hint: "Scope only. No extra gate.",
  },
  {
    id: "limit",
    // Policy presence is the `SCOPE.policy` bit on the actor's scope; `type` is a
    // non-zero off-chain marker only (the protocol does not interpret it). Both
    // presets resolve to the same SessionPolicy contract — they differ only in config.
    type: 1,
    label: "Spending limit",
    hint: "Cap how much the key can move per period (recurring or one-time).",
  },
  {
    id: "allowlist",
    type: 1,
    label: "Target allowlist",
    hint: "Restrict the contract(s) the key may call.",
  },
];

// ---------------------------------------------------------------------------
// App model types.
// ---------------------------------------------------------------------------

export type AppPolicy = {
  /** Non-zero off-chain policy marker. Policy presence is the `SCOPE.policy` scope bit. */
  type: number;
  label: string;
  /** PolicyManager the gated actor is forced to call. */
  manager: Address;
  /** SessionPolicy contract enforcing the binding. */
  policy: Address;
  /** Committed `SessionPolicy` config bytes (re-derives the commitment + actions). */
  policyConfig: Hex;
  /**
   * Complete binding fields required by `PolicyManager.execute`: every execute
   * carries the full committed binding (no install call), so re-deriving the
   * session (see `sessionFor`) MUST re-pass these or the recomputed commitment
   * won't match the account-authorized one and the manager reverts.
   */
  validAfter?: bigint;
  validUntil?: bigint;
  salt?: bigint;
  /** keccak256 of the account-authorized policy binding. */
  commitment: Hex;
  /** Human-readable parameter summary (e.g. "≤ 100 USDV / 7d"). */
  params: string;
  /**
   * Per-token spend caps (for the session-key card's live "remaining" view).
   * `token` is the SessionPolicy token key — the zero address for native ETH.
   */
  limits?: {
    token: Address;
    symbol: string;
    decimals: number;
    /** Cap per rolling window, in token base units. */
    allowance: bigint;
    /** Rolling window length in seconds (`0` = one-shot / no reset). */
    period: number;
  }[];
};

export type AppSessionKey = {
  id: string;
  /** Wallet signer backing this session key. */
  signerId: string;
  label: string;
  kind: "k1" | "p256" | "passkey";
  actorId: Hex;
  authenticator: Address;
  scope: number;
  /** Unix seconds; `0n` = no expiry. */
  expiry: bigint;
  /** Chain the key was authorized for (token addresses are chain-local). */
  chainId?: number;
  policy?: AppPolicy;
  createdAt: number;
  serialized?: Hex;
  /**
   * Private key for app-scoped session keys that should NOT appear in the
   * Demo keys list. When set, the key signs silently without any user prompt.
   * Stored alongside the session key so no separate WalletSigner entry is
   * needed in global state.
   */
  privateKey?: Hex;
  /**
   * Owner-signed authorization captured at registration but NOT yet broadcast.
   * When present, the session key is authorized lazily on its FIRST transaction
   * (which the session key itself signs): the owner-signed config (actor) change
   * rides `accountChanges`. The PolicyManager needs no install call because every
   * `execute` carries the full committed binding. Cleared once that first tx (or
   * a standalone "deploy now" tx) lands. Absent = already authorized onchain.
   */
  pendingAuth?: {
    /** Owner-signed actor change (authorize session key [+ trusted manager]). */
    change: AaAccountChangeConfig;
    /** Config sequence the change advances to. */
    sequence: number;
    /** Whether the change also registered the manager as a trusted executor. */
    registeredManager: boolean;
  };
  /**
   * Owner-signed `revokeActor(actorId)` captured but NOT yet broadcast. Mirrors
   * the owner-change "sign then apply / ride the next tx" flow: pressing Revoke
   * on a landed key signs the revoke (a config change on the per-chain LOCAL
   * counter) and stages it here. It lands via "Apply now" (a no-op tx) or by
   * riding the account's next session-key transaction; the key record is then
   * removed. The PolicyManager is intentionally NOT revoked (other keys may
   * share it). Only ever set on an on-chain key (never together with pendingAuth).
   */
  pendingRevoke?: {
    /** Owner-signed `revokeActor` change for this session key's actor. */
    change: AaAccountChangeConfig;
    /** Local config sequence the change consumes. */
    sequence: number;
  };
};

export type AppSubAccount = {
  id: string;
  label: string;
  salt: Hex;
  address: Address;
  /** Wallet signers that own the sub-account directly. */
  signerIds: string[];
  /** Parent address the sub-account delegates control to. */
  delegateTo: Address;
  createdAt: number;
};

export type ActivityKind =
  | "create"
  | "transact"
  | "session"
  | "subaccount"
  | "revoke";

export type ActivityEntry = {
  id: string;
  ts: number;
  kind: ActivityKind;
  title: string;
  detail?: string;
  changes?: string[];
  calls?: number;
  metadata?: string;
  network?: string;
  mode?: "eip8130-native" | "erc4337";
  serialized?: Hex;
  txHash?: Hex;
  account?: Address;
};

// ---------------------------------------------------------------------------
// Formatting helpers.
// ---------------------------------------------------------------------------

/** Relative expiry label from an absolute unix-seconds expiry. */
export function formatExpiry(expiry: bigint): string {
  if (!expiry) return "No expiry";
  const secs = Number(expiry) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "Expired";
  const d = Math.floor(secs / 86_400);
  if (d >= 1) return `${d}d left`;
  const h = Math.floor(secs / 3600);
  if (h >= 1) return `${h}h left`;
  const m = Math.max(1, Math.floor(secs / 60));
  return `${m}m left`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const ACTIVITY_ICON: Record<ActivityKind, string> = {
  create: "+",
  transact: "→",
  session: "◷",
  subaccount: "⌂",
  revoke: "×",
};

// ---------------------------------------------------------------------------
// Stored (locally-persisted) account model.
// ---------------------------------------------------------------------------

export type SignerKind = "k1" | "p256" | "passkey";

/** An actor bound to an account, paired with the wallet signer that backs it. */
export type StoredActor = {
  signerId: string;
  actorId: Hex;
  authenticator: Address;
  kind: SignerKind;
  label: string;
  /** Display identity (address / pubkey.x / credential id). */
  identity: string;
  /** Permission bitmask; `0`/undefined = full control (owner). */
  scope?: number;
};

/**
 * "smart" — counterfactual account deployed via `createAccount` (address is
 * derived from keys + salt). "eoa" — an existing EOA that *is* the account; it
 * delegates its code to the DefaultAccount implementation and its own
 * secp256k1 key is the default owner. Absent = "smart" (legacy records).
 */
export type AccountType = "smart" | "eoa";

export type StoredAccount = {
  id: string;
  label: string;
  /** Account model. Absent on legacy records → treat as "smart". */
  type?: AccountType;
  /**
   * Set on sub-account records: the id of the parent account that controls this
   * one via `key.delegate(parent)`. Key selection for a sub-account resolves to
   * the parent's owner signers (the parent is the on-chain delegate owner).
   */
  parentId?: string;
  saltField: string;
  salt: Hex;
  address: Address;
  /** EOA-only: code-delegation target (DefaultAccount implementation). */
  delegate?: Address;
  /** Actors bound into the address — immutable (changing them changes address). */
  initialActors: StoredActor[];
  /** Current applied owner set (initial + authorized − revoked). */
  owners: StoredActor[];
  /** Has a chain/offline tx carrying `account.create()` been signed. */
  deployed: boolean;
  configSeq: number;
  sessionKeys: AppSessionKey[];
  /**
   * PolicyManager addresses already registered on-chain as trusted-executor
   * actors. A policy-gated session key needs its manager registered once so
   * `PolicyManager.execute -> account.executeBatch` is accepted; the manager is
   * NEVER revoked when a session key is removed (other keys may share it, and
   * re-registering an existing actor reverts). Tracked here so a subsequent
   * authorize doesn't re-add a manager that's already present. Absent on legacy
   * records → fall back to inferring from `sessionKeys`.
   */
  trustedManagers?: Address[];
  subAccounts: AppSubAccount[];
  createdAt: number;
};

// ---------------------------------------------------------------------------
// bigint-safe (de)serialization for localStorage.
// ---------------------------------------------------------------------------

function bnReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? { $bn: value.toString() } : value;
}

function bnReviver(_key: string, value: unknown) {
  if (value && typeof value === "object" && "$bn" in (value as object))
    return BigInt((value as { $bn: string }).$bn);
  return value;
}

export function serializeState<T>(value: T): string {
  return JSON.stringify(value, bnReplacer);
}

export function deserializeState<T>(raw: string): T {
  return JSON.parse(raw, bnReviver) as T;
}

// ---------------------------------------------------------------------------
// Balance formatting.
// ---------------------------------------------------------------------------

/** Compact ETH from wei (string|bigint), trimmed to 4 sig decimals. */
export function formatEthWei(wei: string | bigint | null | undefined): string {
  if (wei === null || wei === undefined) return "N/A";
  const v = typeof wei === "bigint" ? wei : BigInt(wei);
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

/** Token amount from base units with `decimals`, 2-decimal display. */
export function formatUnits(
  amount: string | bigint | null | undefined,
  decimals: number | null | undefined,
): string {
  if (
    amount === null ||
    amount === undefined ||
    decimals === null ||
    decimals === undefined
  )
    return "N/A";
  const v = typeof amount === "bigint" ? amount : BigInt(amount);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").slice(0, 2);
  return `${whole.toLocaleString()}.${frac}`;
}
