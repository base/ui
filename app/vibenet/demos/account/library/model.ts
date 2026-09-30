// App-level account model for the EIP-8130 demo. With the Keystore disabled an
// account is a plain secp256k1 EOA: its key signs `sender_auth`, its address is
// the account, and it can optionally point its code at a delegation target.

import type { Address, Hex } from "@aa";

import type { WalletSigner } from "../shared";

// ---------------------------------------------------------------------------
// Activity log.
// ---------------------------------------------------------------------------

export type ActivityKind = "create" | "transact" | "delegate";

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
  /** Block the tx landed in (Cobalt: one every 200 ms on vibenet). */
  blockNumber?: number;
  /** Block time in unix ms from Cobalt's `timestampMs`; null on chains without it. */
  blockTimestampMs?: number | null;
  /** Chain time from the block seen at broadcast to the inclusion block; null without an anchor. */
  chainMs?: number | null;
  /** The same in blocks. */
  blocksAfterSend?: number | null;
};

// ---------------------------------------------------------------------------
// Formatting helpers.
// ---------------------------------------------------------------------------

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Stored (locally-persisted) account model.
// ---------------------------------------------------------------------------

export type SignerKind = "k1";

/** An EOA account: the address of the wallet key `signerId`. */
export type StoredAccount = {
  id: string;
  label: string;
  type: "eoa";
  signerId: string;
  address: Address;
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
// Legacy (Keystore-era) record migration.
// ---------------------------------------------------------------------------

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const ACTIVITY_KINDS: readonly ActivityKind[] = ["create", "transact", "delegate"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * Keep only what an EOA-only chain can use from a persisted store written by an
 * older build: K1 keys, and EOA accounts backed by one of those keys (the key
 * whose address is the account). Smart accounts, sub-accounts, and P-256 /
 * passkey keys are dropped; session keys, owners, and salts are discarded.
 */
export function normalizePersistedState(raw: unknown): {
  signers: WalletSigner[];
  accounts: StoredAccount[];
  activeAccountId: string | null;
  activity: ActivityEntry[];
} {
  const state = asRecord(raw) ?? {};

  const signers: WalletSigner[] = [];
  for (const item of Array.isArray(state.signers) ? state.signers : []) {
    const s = asRecord(item);
    if (!s || s.kind !== "k1") continue;
    if (typeof s.id !== "string" || typeof s.privateKey !== "string" || typeof s.address !== "string") continue;
    if (!PRIVATE_KEY_RE.test(s.privateKey) || !ADDRESS_RE.test(s.address)) continue;
    signers.push({
      id: s.id,
      kind: "k1",
      label: typeof s.label === "string" ? s.label : "K1",
      privateKey: s.privateKey as Hex,
      address: s.address as Address,
    });
  }
  const signerByAddress = new Map(signers.map((s) => [s.address.toLowerCase(), s]));

  const accounts: StoredAccount[] = [];
  for (const item of Array.isArray(state.accounts) ? state.accounts : []) {
    const a = asRecord(item);
    if (!a || a.type !== "eoa" || a.parentId) continue;
    if (typeof a.id !== "string" || typeof a.address !== "string") continue;
    const signer = signerByAddress.get(a.address.toLowerCase());
    if (!signer) continue;
    accounts.push({
      id: a.id,
      label: typeof a.label === "string" ? a.label : "Account",
      type: "eoa",
      signerId: signer.id,
      address: signer.address,
      createdAt: typeof a.createdAt === "number" ? a.createdAt : Date.now(),
    });
  }

  const storedActive = typeof state.activeAccountId === "string" ? state.activeAccountId : null;
  const activeAccountId = accounts.some((a) => a.id === storedActive) ? storedActive : (accounts[0]?.id ?? null);

  const activity: ActivityEntry[] = [];
  for (const item of Array.isArray(state.activity) ? state.activity : []) {
    const e = asRecord(item);
    if (!e || typeof e.id !== "string" || typeof e.title !== "string" || typeof e.ts !== "number") continue;
    const kind = ACTIVITY_KINDS.includes(e.kind as ActivityKind) ? (e.kind as ActivityKind) : "transact";
    activity.push({ ...(e as ActivityEntry), kind });
  }

  return { signers, accounts, activeAccountId, activity };
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
