import type { Address, Hex } from 'viem';

import {
  BOX_SPAN_DEN,
  BOX_SPAN_NUM,
  PAIR_RESERVES_SLOT,
  RESERVE0_MASK,
  RESERVE1_MASK,
  RESERVE_BITS,
  WAD,
} from './constants';
import type {
  Rectangle,
  Side,
  StoragePredicate,
  ValidityOperator,
  ValidityPredicate,
} from './types';

export function toWord(value: bigint): Hex {
  if (value < 0n) throw new Error('toWord: negative value');
  const hex = value.toString(16);
  if (hex.length > 64) throw new Error('toWord: value exceeds 32 bytes');
  return `0x${hex.padStart(64, '0')}` as Hex;
}

export function sqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('sqrt of negative');
  if (n < 2n) return n;
  let x0 = n;
  let x1 = (n >> 1n) + 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x1 + n / x1) >> 1n;
  }
  return x0;
}

export function formatPrice(wad: bigint, digits = 4): string {
  const negative = wad < 0n;
  const abs = negative ? -wad : wad;
  const int = abs / WAD;
  const frac = (abs % WAD).toString().padStart(18, '0').slice(0, digits);
  return `${negative ? '-' : ''}${int.toString()}.${frac}`;
}

/** Parse a typed price like "1.0421", "$0.98", or "1,024.5" into wad. Null if not a positive price. */
export function parsePriceWad(input: string): bigint | null {
  const cleaned = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return null;
  const [intPart = '0', fracPart = ''] = cleaned.split('.');
  if (fracPart.length > 18) return null;
  const wad = BigInt(intPart || '0') * WAD + BigInt(fracPart.padEnd(18, '0') || '0');
  return wad > 0n ? wad : null;
}

/** Apply a basis-point offset to spot. Buy is below (`-bps`), sell is above (`+bps`). 0 is at mid. */
export function applyOffsetBps(spotWad: bigint, side: Side, offsetBps: number): bigint {
  if (spotWad <= 0n) throw new Error('Need a live mid price.');
  if (!Number.isInteger(offsetBps) || offsetBps < 0 || offsetBps >= 10_000) {
    throw new Error('Offset must be inside [0, 100%).');
  }
  if (offsetBps === 0) return spotWad;
  const bps = BigInt(offsetBps);
  if (side === 'buy') return (spotWad * (10_000n - bps)) / 10_000n || 1n;
  return (spotWad * (10_000n + bps)) / 10_000n;
}

export function compactHexString(hex: string): string {
  if (!/^0x[0-9a-fA-F]+$/i.test(hex)) return hex;
  // Only collapse padded 32-byte words. Leave addresses and other hex alone.
  if (hex.length !== 66) return hex;
  const body = hex.slice(2).replace(/^0+/, '');
  return `0x${body.length ? body.toLowerCase() : '0'}`;
}

export function prettyValidity(predicates: ValidityPredicate[]): string {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) return compactHexString(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, walk(nested)]));
    }
    return value;
  };
  return JSON.stringify(walk(predicates), null, 2);
}

/**
 * Finite reserve box around the target point on the current hyperbola.
 *
 * buy  (price ≤ P): A ≤ r0 ≤ A·s ∧ B/s ≤ r1 ≤ B  with B/A ≤ P
 * sell (price ≥ P): A/s ≤ r0 ≤ A ∧ B ≤ r1 ≤ B·s  with B/A ≥ P
 *
 * Four storage predicates, so a drained or wildly expanded pool cannot fill.
 *
 * When `currentPriceWad` already satisfies the condition (a buy priced above
 * the mid, a sell priced below it), the box stretches along the hyperbola to
 * the current point so the order fills without the mid retracing to target.
 */
export function rectangleForTarget(
  k: bigint,
  targetPriceWad: bigint,
  side: Side,
  currentPriceWad?: bigint,
): Rectangle {
  if (k === 0n || targetPriceWad <= 0n) {
    throw new Error('Need a live pool and a positive target price.');
  }
  const a = sqrt((k * WAD) / targetPriceWad);
  if (a === 0n) throw new Error('Degenerate reserve bound.');
  const aCur =
    currentPriceWad !== undefined && currentPriceWad > 0n
      ? sqrt((k * WAD) / currentPriceWad)
      : a;
  if (side === 'buy') {
    const b = (a * targetPriceWad) / WAD || 1n;
    // Larger r0 means lower price; a satisfied buy sits at aOut > a.
    const aOut = aCur > a ? aCur : a;
    const bOut = k / aOut || 1n;
    const r0Max = (aOut * BOX_SPAN_NUM) / BOX_SPAN_DEN;
    const r1Min = (bOut * BOX_SPAN_DEN) / BOX_SPAN_NUM;
    return {
      r0Min: a,
      r0Max: r0Max > a ? r0Max : a + 1n,
      r1Min: r1Min < b ? r1Min : 1n,
      r1Max: b,
      side,
    };
  }
  const b = (a * targetPriceWad + WAD - 1n) / WAD;
  // Smaller r0 means higher price; a satisfied sell sits at aOut < a.
  const aOut = aCur < a && aCur > 0n ? aCur : a;
  const bOut = (k + aOut - 1n) / aOut;
  const r0Min = (aOut * BOX_SPAN_DEN) / BOX_SPAN_NUM;
  const r1Max = (bOut * BOX_SPAN_NUM) / BOX_SPAN_DEN;
  return {
    r0Min: r0Min < a ? r0Min : 1n,
    r0Max: a,
    r1Min: b,
    r1Max: r1Max > b ? r1Max : b + 1n,
    side,
  };
}

export function storagePredicate(
  address: Address,
  slot: bigint,
  mask: bigint,
  op: ValidityOperator,
  value: bigint,
): StoragePredicate {
  if ((value & ~mask) !== 0n) {
    throw new Error('Storage predicate value has bits outside its mask.');
  }
  return {
    type: 'storage',
    params: {
      address,
      slot: toWord(slot),
      mask: toWord(mask),
      op,
      value: toWord(value),
    },
  };
}

export function priceValidity(
  pair: Address,
  k: bigint,
  targetPriceWad: bigint,
  side: Side,
  currentPriceWad?: bigint,
): { rectangle: Rectangle; predicates: ValidityPredicate[] } {
  const rectangle = rectangleForTarget(k, targetPriceWad, side, currentPriceWad);
  const r1MinValue = rectangle.r1Min << RESERVE_BITS;
  const r1MaxValue = rectangle.r1Max << RESERVE_BITS;
  const predicates: ValidityPredicate[] = [
    storagePredicate(pair, PAIR_RESERVES_SLOT, RESERVE0_MASK, '>=', rectangle.r0Min),
    storagePredicate(pair, PAIR_RESERVES_SLOT, RESERVE0_MASK, '<=', rectangle.r0Max),
    storagePredicate(pair, PAIR_RESERVES_SLOT, RESERVE1_MASK, '>=', r1MinValue),
    storagePredicate(pair, PAIR_RESERVES_SLOT, RESERVE1_MASK, '<=', r1MaxValue),
  ];
  return { rectangle, predicates };
}

export function blockNumberPredicate(op: ValidityOperator, block: bigint): ValidityPredicate {
  return {
    type: 'block_number',
    params: { op, value: toWord(block) },
  };
}

export function blockExpiryPredicate(maxBlock: bigint): ValidityPredicate {
  return blockNumberPredicate('<=', maxBlock);
}

/** Not-before bound: the sequencer holds the tx until this block. */
export function blockDelayPredicate(minBlock: bigint): ValidityPredicate {
  return blockNumberPredicate('>=', minBlock);
}
