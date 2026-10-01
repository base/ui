import type { Address, Hex } from 'viem';

import type { Position } from '../lib/lending';
import type { ValidityPredicate } from '../lib/types';

export const LIQUIDATION_EXPIRY_OPTIONS = [15, 30, 60] as const;
export type LiquidationExpiry = (typeof LIQUIDATION_EXPIRY_OPTIONS)[number];

export type AttemptKind = 'validity' | 'manual';

export type AttemptStatus =
  | 'signing'
  /** Validity tx in the sequencer's pool, waiting for its predicates. */
  | 'armed'
  /** Plain tx broadcast, waiting for a receipt. */
  | 'pending'
  | 'success'
  | 'reverted'
  | 'expired'
  /** Someone else liquidated the position first. */
  | 'beaten'
  | 'error';

export type LiquidationAttempt = {
  id: number;
  kind: AttemptKind;
  borrower: Address;
  position: Position;
  status: AttemptStatus;
  submittedAt: number;
  submittedBlock: bigint;
  /** Validity expiry bound (inclusive). */
  maxBlock?: bigint;
  hash?: Hex;
  includedBlock?: bigint;
  /** VIBE paid to us by the `Liquidated` event in a successful receipt. */
  reward?: bigint;
  /** Block in which the position was first seen liquidatable, if observed. */
  underwaterBlock?: bigint;
  /** USDV-per-VIBE (1e18) price at which the reserve predicate opens. */
  triggerPriceWad?: bigint;
  predicates?: ValidityPredicate[];
  error?: string;
};

export type LiquidationEvent = {
  borrower: Address;
  liquidator: Address;
  collateral: bigint;
  debt: bigint;
  reward: bigint;
  block: bigint;
  txHash: Hex;
  underwaterBlock?: bigint;
};

const SETTLED: ReadonlySet<AttemptStatus> = new Set(['success', 'reverted', 'expired', 'error']);

export function isSettled(status: AttemptStatus): boolean {
  return SETTLED.has(status);
}

/**
 * Whether the account's next nonce is free for a new attempt. A beaten
 * validity tx can never land (its position predicate no longer matches), but
 * the sequencer keeps it pooled until its expiry block, so a new transaction on
 * the same nonce would be rejected as an underpriced replacement.
 */
export function nonceFree(attempt: LiquidationAttempt | null, head: bigint | null): boolean {
  if (!attempt) return true;
  if (isSettled(attempt.status)) return true;
  if (attempt.status === 'beaten') {
    return attempt.kind === 'manual' || (attempt.maxBlock !== undefined && head !== null && head > attempt.maxBlock);
  }
  return false;
}

/** Blocks from the position going under water to the liquidation landing. */
export function blocksUnderwater(
  underwaterBlock: bigint | undefined,
  includedBlock: bigint | undefined,
): bigint | null {
  if (underwaterBlock === undefined || includedBlock === undefined) return null;
  return includedBlock >= underwaterBlock ? includedBlock - underwaterBlock : 0n;
}

export const positionKey = (position: Position) => `${position.collateral}:${position.debt}`;

export type Underwater = { block: bigint; key: string };

/**
 * Update the first-seen-liquidatable block per borrower. A position that
 * recovers, or is replaced by a different position, starts over.
 */
export function trackUnderwater(
  previous: ReadonlyMap<Address, Underwater>,
  entries: readonly (Position & { borrower: Address; liquidatable: boolean })[],
  block: bigint,
): Map<Address, Underwater> {
  const next = new Map<Address, Underwater>();
  for (const entry of entries) {
    if (!entry.liquidatable) continue;
    const key = positionKey(entry);
    const seen = previous.get(entry.borrower);
    next.set(entry.borrower, seen && seen.key === key ? seen : { block, key });
  }
  return next;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** VIBE earned across successful attempts, optionally only those of one kind. */
export function totalEarned(attempts: readonly (LiquidationAttempt | null)[], kind?: AttemptKind): bigint {
  return attempts.reduce(
    (sum, a) =>
      a?.status === 'success' && a.reward !== undefined && (kind === undefined || a.kind === kind) ? sum + a.reward : sum,
    0n,
  );
}
