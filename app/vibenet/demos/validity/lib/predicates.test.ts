import { describe, expect, it } from 'vitest';

import { RESERVE0_MASK, RESERVE1_MASK, RESERVE_BITS, WAD } from './constants';
import {
  applyOffsetBps,
  blockExpiryPredicate,
  blockNumberPredicate,
  formatPrice,
  parsePriceWad,
  prettyValidity,
  priceValidity,
  rectangleForTarget,
  sqrt,
  toWord,
} from './predicates';

const PAIR = '0x1111111111111111111111111111111111111111';

describe('predicates', () => {
  it('integer-square-roots perfect and imperfect squares', () => {
    expect(sqrt(0n)).toBe(0n);
    expect(sqrt(1n)).toBe(1n);
    expect(sqrt(9n)).toBe(3n);
    expect(sqrt(10n)).toBe(3n);
    expect(sqrt(100n * WAD * WAD)).toBe(10n * WAD);
  });

  it('formats wad prices', () => {
    expect(formatPrice(WAD)).toBe('1.0000');
    expect(formatPrice(99n * 10n ** 16n)).toBe('0.9900');
  });

  it('parses typed prices into wad', () => {
    expect(parsePriceWad('1')).toBe(WAD);
    expect(parsePriceWad('1.0000')).toBe(WAD);
    expect(parsePriceWad('$0.99')).toBe(99n * 10n ** 16n);
    expect(parsePriceWad('.5')).toBe(WAD / 2n);
    expect(parsePriceWad('1,024.5')).toBe(1_024n * WAD + WAD / 2n);
    expect(parsePriceWad(' 2.5 ')).toBe((5n * WAD) / 2n);
    expect(parsePriceWad(formatPrice((3n * WAD) / 2n))).toBe((3n * WAD) / 2n);
  });

  it('rejects non-prices', () => {
    expect(parsePriceWad('')).toBeNull();
    expect(parsePriceWad('0')).toBeNull();
    expect(parsePriceWad('0.000')).toBeNull();
    expect(parsePriceWad('-1')).toBeNull();
    expect(parsePriceWad('1e3')).toBeNull();
    expect(parsePriceWad('1.2.3')).toBeNull();
    expect(parsePriceWad('abc')).toBeNull();
    expect(parsePriceWad('1.0000000000000000001')).toBeNull();
  });

  it('offsets spot in basis points for buy and sell', () => {
    expect(applyOffsetBps(WAD, 'buy', 100)).toBe((99n * WAD) / 100n);
    expect(applyOffsetBps(WAD, 'sell', 100)).toBe((101n * WAD) / 100n);
    expect(applyOffsetBps(WAD, 'buy', 0)).toBe(WAD);
    expect(applyOffsetBps(WAD, 'sell', 0)).toBe(WAD);
  });

  it('buy box implies every corner has price ≤ P', () => {
    const k = 1_000n * WAD * (1_000n * WAD);
    const target = (99n * WAD) / 100n;
    const box = rectangleForTarget(k, target, 'buy');
    const worst = (box.r1Max * WAD) / box.r0Min;
    expect(worst).toBeLessThanOrEqual(target);
    expect(box.r0Max).toBeGreaterThan(box.r0Min);
    expect(box.r1Max).toBeGreaterThan(box.r1Min);
    expect((box.r0Max * 1000n) / box.r0Min).toBeGreaterThanOrEqual(1050n);
    expect((box.r0Max * 1000n) / box.r0Min).toBeLessThanOrEqual(1070n);

    const { predicates } = priceValidity(PAIR, k, target, 'buy');
    expect(predicates).toHaveLength(4);
    expect(predicates[0]).toMatchObject({
      type: 'storage',
      params: { address: PAIR, op: '>=', mask: toWord(RESERVE0_MASK) },
    });
    expect(predicates[1].params.op).toBe('<=');
    expect(predicates[1].params.mask).toBe(toWord(RESERVE0_MASK));
    expect(predicates[2].params.op).toBe('>=');
    expect(predicates[2].params.mask).toBe(toWord(RESERVE1_MASK));
    expect(predicates[3].params.op).toBe('<=');
    const r1MaxValue = BigInt(predicates[3].params.value);
    expect(r1MaxValue).toBe(box.r1Max << RESERVE_BITS);
    expect((r1MaxValue & ~RESERVE1_MASK) === 0n).toBe(true);
  });

  it('sell box implies every corner has price ≥ P', () => {
    const k = 1_000n * WAD * (1_000n * WAD);
    const target = (101n * WAD) / 100n;
    const box = rectangleForTarget(k, target, 'sell');
    const worst = (box.r1Min * WAD) / box.r0Max;
    expect(worst).toBeGreaterThanOrEqual(target);
    expect(box.r0Max).toBeGreaterThan(box.r0Min);
    expect(box.r1Max).toBeGreaterThan(box.r1Min);

    const { predicates } = priceValidity(PAIR, k, target, 'sell');
    expect(predicates).toHaveLength(4);
    expect(predicates[0].params.op).toBe('>=');
    expect(predicates[1].params.op).toBe('<=');
    expect(predicates[2].params.op).toBe('>=');
    expect(predicates[3].params.op).toBe('<=');
  });

  it('pretty-prints validity JSON with compact hex', () => {
    const k = 1_000n * WAD * (1_000n * WAD);
    const { predicates } = priceValidity(PAIR, k, WAD, 'buy');
    const pretty = prettyValidity(predicates);
    expect(pretty).toContain('"slot": "0x8"');
    expect(pretty).not.toContain('0x00000000');
  });

  it('builds generic block predicates without changing block expiry behavior', () => {
    expect(blockNumberPredicate('>=', 42n)).toEqual({
      type: 'block_number',
      params: { op: '>=', value: toWord(42n) },
    });
    expect(blockExpiryPredicate(42n)).toEqual({
      type: 'block_number',
      params: { op: '<=', value: toWord(42n) },
    });
  });

});
