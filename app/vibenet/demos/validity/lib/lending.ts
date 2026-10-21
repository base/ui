import {
  encodeAbiParameters,
  encodeDeployData,
  encodeFunctionData,
  keccak256,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

import artifact from './artifacts/VibeLend.json';
import { PAIR_RESERVES_SLOT, RESERVE0_MASK, RESERVE1_MASK, RESERVE_BITS, WAD } from './constants';
import { blockExpiryPredicate, sqrt, storagePredicate } from './predicates';
import { create2Address, hasCode, singletonSalt } from './singleton';
import type { ValidityPredicate } from './types';

export const vibeLendAbi = artifact.abi as Abi;
export const vibeLendBytecode = artifact.bytecode as Hex;

export const LENDING_SALT = singletonSalt('lending');
export const LIQUIDATION_THRESHOLD_BPS = 8_000n;
export const LIQUIDATION_REWARD_BPS = 500n;
const BPS = 10_000n;
/** USDV has 6 decimals and VIBE 18: price(1e18) = usdv * 1e30 / vibe. */
const PRICE_SCALE = 10n ** 30n;
const WORD_MASK = (1n << 256n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;

export type Position = { collateral: bigint; debt: bigint };
export type BookEntry = Position & { borrower: Address };
export type LendingReserves = { vibe: bigint; usdv: bigint };

export function lendingInitCode(vibe: Address, usdv: Address, pair: Address): Hex {
  return encodeDeployData({
    abi: vibeLendAbi,
    bytecode: vibeLendBytecode,
    args: [vibe, usdv, pair],
  });
}

export function predictLending(vibe: Address, usdv: Address, pair: Address): Address {
  return create2Address(LENDING_SALT, lendingInitCode(vibe, usdv, pair));
}

/** The shared VibeLend singleton for this pool, or null until vibenet-setup deploys it. */
export async function probeLending(
  client: PublicClient,
  vibe: Address,
  usdv: Address,
  pair: Address,
): Promise<Address | null> {
  const address = predictLending(vibe, usdv, pair);
  if (!(await hasCode(client, address))) return null;
  const configuredPair = await client
    .readContract({ address, abi: vibeLendAbi, functionName: 'PAIR' })
    .catch(() => null);
  return typeof configuredPair === 'string' && configuredPair.toLowerCase() === pair.toLowerCase()
    ? address
    : null;
}

/** Every open position plus the (VIBE, USDV) reserves the contract prices with. */
export async function readBook(
  client: PublicClient,
  lending: Address,
): Promise<{ entries: BookEntry[]; reserves: LendingReserves }> {
  const [book, reserves] = await Promise.all([
    client.readContract({ address: lending, abi: vibeLendAbi, functionName: 'book' }) as Promise<
      readonly [readonly Address[], readonly Position[]]
    >,
    client.readContract({ address: lending, abi: vibeLendAbi, functionName: 'reserves' }) as Promise<
      readonly [bigint, bigint]
    >,
  ]);
  const [borrowers, positions] = book;
  const entries = borrowers
    .map((borrower, i) => ({ borrower, ...(positions[i] ?? { collateral: 0n, debt: 0n }) }))
    .filter((entry) => entry.collateral > 0n);
  return { entries, reserves: { vibe: reserves[0], usdv: reserves[1] } };
}

export function isLiquidatable(position: Position, reserves: LendingReserves): boolean {
  if (position.collateral === 0n) return false;
  return (
    position.collateral * reserves.usdv * LIQUIDATION_THRESHOLD_BPS <
    position.debt * reserves.vibe * BPS
  );
}

/** Same scale as VibeLend.healthFactor: below 1e18 the position is liquidatable. */
export function healthFactorWad(position: Position, reserves: LendingReserves): bigint {
  if (position.debt === 0n || reserves.vibe === 0n) return WORD_MASK;
  return (
    (position.collateral * reserves.usdv * LIQUIDATION_THRESHOLD_BPS * WAD) /
    (position.debt * reserves.vibe * BPS)
  );
}

/** USDV per VIBE (1e18-scaled) below which the position is liquidatable. */
export function liquidationPriceWad(position: Position): bigint {
  if (position.collateral === 0n) return 0n;
  return (position.debt * BPS * PRICE_SCALE) / (position.collateral * LIQUIDATION_THRESHOLD_BPS);
}

export function spotPriceWad(reserves: LendingReserves): bigint {
  if (reserves.vibe === 0n) return 0n;
  return (reserves.usdv * PRICE_SCALE) / reserves.vibe;
}

export function liquidationReward(position: Position): bigint {
  return (position.collateral * LIQUIDATION_REWARD_BPS) / BPS;
}

/** `positions[borrower]` lives at keccak256(abi.encode(borrower, 0)). */
export function positionSlot(borrower: Address): bigint {
  return BigInt(
    keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [borrower, 0n])),
  );
}

/** The packed storage word: collateral in the low 128 bits, debt in the high 128. */
export function packPosition(position: Position): bigint {
  if (position.collateral > UINT128_MAX || position.debt > UINT128_MAX) {
    throw new Error('Position field exceeds uint128.');
  }
  return position.collateral | (position.debt << 128n);
}

/**
 * Largest USDV reserve `u` such that `u ≤ ceiling` guarantees the position is
 * liquidatable, given the pool's current constant product `k`.
 *
 * The sequencer can only compare one reserve against a constant, but
 * liquidatability depends on the ratio of both. The pool charges no fee and no
 * one removes liquidity, so k never decreases: at inclusion `vibe ≥ k / u`. If
 * `collateral · 8000 · u² < debt · 10000 · k`, multiplying through by
 * `vibe · u ≥ k` gives `collateral · u · 8000 < debt · vibe · 10000`, which is
 * exactly the contract's liquidation test. So the predicate never admits a
 * transaction that would revert with "healthy".
 */
export function usdvReserveCeiling(position: Position, k: bigint): bigint {
  if (position.collateral === 0n || position.debt === 0n || k === 0n) return 0n;
  const numerator = position.debt * BPS * k;
  const denominator = position.collateral * LIQUIDATION_THRESHOLD_BPS;
  if (numerator === 0n) return 0n;
  return sqrt((numerator - 1n) / denominator);
}

/** USDV-per-VIBE price (1e18) at the ceiling on the current curve, for display. */
export function ceilingPriceWad(ceiling: bigint, k: bigint): bigint {
  if (k === 0n) return 0n;
  return (ceiling * ceiling * PRICE_SCALE) / k;
}

export function encodeLiquidate(lending: Address, borrower: Address): { to: Address; data: Hex } {
  return {
    to: lending,
    data: encodeFunctionData({ abi: vibeLendAbi, functionName: 'liquidate', args: [borrower] }),
  };
}

export type LiquidationValidity = {
  predicates: ValidityPredicate[];
  ceiling: bigint;
  ceilingPriceWad: bigint;
};

/**
 * Validity predicates for liquidating `borrower`:
 *
 * 1. the pair's USDV reserve is at or below the ceiling, so the position is
 *    under water when the transaction lands;
 * 2. the position word still equals what we read, so the transaction is
 *    dropped rather than reverted if someone else liquidates first or the
 *    borrower closes or reopens;
 * 3. a block-number expiry.
 */
export function liquidationValidity(args: {
  lending: Address;
  pair: Address;
  vibeIsToken0: boolean;
  borrower: Address;
  position: Position;
  reserves: LendingReserves;
  maxBlock: bigint;
}): LiquidationValidity {
  const k = args.reserves.vibe * args.reserves.usdv;
  let ceiling = usdvReserveCeiling(args.position, k);
  if (ceiling === 0n) throw new Error('Position cannot be liquidated at any price.');
  if (ceiling > RESERVE0_MASK) ceiling = RESERVE0_MASK;
  const [mask, value] = args.vibeIsToken0
    ? [RESERVE1_MASK, ceiling << RESERVE_BITS]
    : [RESERVE0_MASK, ceiling];
  return {
    predicates: [
      storagePredicate(args.pair, PAIR_RESERVES_SLOT, mask, '<=', value),
      storagePredicate(
        args.lending,
        positionSlot(args.borrower),
        WORD_MASK,
        '=',
        packPosition(args.position),
      ),
      blockExpiryPredicate(args.maxBlock),
    ],
    ceiling,
    ceilingPriceWad: ceilingPriceWad(ceiling, k),
  };
}
