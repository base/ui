import { encodeAbiParameters, encodeEventTopics, parseAbi, zeroAddress } from 'viem';
import { describe, expect, it } from 'vitest';

import { amountInForExactOut, amountInForVibe, amountOut, amountOutAtLimit, encodeMint, reservesFromSyncLog } from './amm';
import { SEED_USDV, SEED_VIBE, TRADE_VIBE, USDV_UNIT, WAD } from './constants';
import { quoteWad } from './quote';

describe('encodeMint', () => {
  it('mints VIBE through the open minter and USDV on the token', () => {
    const vibe = '0x00000000000000000000000000000000000000aa' as const;
    const usdv = '0x00000000000000000000000000000000000000bb' as const;
    const minter = '0x00000000000000000000000000000000000000cc' as const;
    const to = '0x00000000000000000000000000000000000000dd' as const;
    expect(encodeMint(vibe, to, 1n, minter).to).toBe(minter);
    expect(encodeMint(usdv, to, 1n).to).toBe(usdv);
  });
});

describe('amountOut', () => {
  it('uses a 0% fee so k is conserved', () => {
    expect(amountOut(100n, 1000n, 2000n)).toBe(181n);
    expect(amountOut(10n ** 18n, 100n * 10n ** 18n, 100n * 10n ** 18n)).toBe(
      (10n ** 18n * 100n * 10n ** 18n) / (101n * 10n ** 18n),
    );
  });

  it('returns 0 when any leg is empty', () => {
    expect(amountOut(0n, 1000n, 2000n)).toBe(0n);
    expect(amountOut(100n, 0n, 2000n)).toBe(0n);
  });
});

describe('amountOutAtLimit', () => {
  it('sizes a resting buy on the limit curve, not submit-time spot', () => {
    const k = SEED_VIBE * SEED_USDV;
    const spot = quoteWad(SEED_VIBE, SEED_USDV, true);
    const limit = (spot * 98n) / 100n;
    const amountIn = 800n * USDV_UNIT;
    const atSpot = amountOut(amountIn, SEED_USDV, SEED_VIBE);
    const atLimit = amountOutAtLimit(amountIn, 'buy', k, limit);
    expect(atLimit).toBeGreaterThan(atSpot);
    const fill = (amountIn * WAD) / atLimit;
    expect(fill).toBeLessThan((amountIn * WAD) / atSpot);
    expect(((fill - limit) * 10_000n) / limit).toBeLessThan(100n);
  });
});

describe('amountInForVibe', () => {
  it('sells a fixed VIBE size and buys enough USDV for that size at the limit', () => {
    const k = SEED_VIBE * SEED_USDV;
    const spot = quoteWad(SEED_VIBE, SEED_USDV, true);
    expect(amountInForVibe(TRADE_VIBE, 'sell', k, spot)).toBe(TRADE_VIBE);
    const usdvIn = amountInForVibe(TRADE_VIBE, 'buy', k, spot);
    expect(usdvIn).toBeGreaterThan(0n);
    expect(amountOutAtLimit(usdvIn, 'buy', k, spot)).toBeGreaterThanOrEqual(TRADE_VIBE);
  });

  it('ceils exact-out input so rounding cannot underfill', () => {
    expect(amountInForExactOut(181n, 1000n, 2000n)).toBe(100n);
    expect(amountOut(100n, 1000n, 2000n)).toBe(181n);
    expect(amountInForExactOut(0n, 1000n, 2000n)).toBe(0n);
    expect(amountInForExactOut(2000n, 1000n, 2000n)).toBe(0n);
  });
});

describe('reservesFromSyncLog', () => {
  it('decodes Uni v2 Sync reserves', () => {
    const abi = parseAbi(['event Sync(uint112 reserve0, uint112 reserve1)']);
    const [topic] = encodeEventTopics({ abi, eventName: 'Sync' });
    const log = {
      address: zeroAddress,
      topics: [topic],
      data: encodeAbiParameters(
        [{ type: 'uint112' }, { type: 'uint112' }],
        [1_000n * WAD, 70n * WAD],
      ),
    };
    expect(reservesFromSyncLog(log)).toEqual({
      reserve0: 1_000n * WAD,
      reserve1: 70n * WAD,
      blockTimestampLast: 0,
    });
  });

  it('ignores a Swap topic', () => {
    const abi = parseAbi([
      'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
    ]);
    const topics = encodeEventTopics({
      abi,
      eventName: 'Swap',
      args: { sender: zeroAddress, to: zeroAddress },
    });
    expect(
      reservesFromSyncLog({
        address: zeroAddress,
        topics,
        data: encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
          [1n, 0n, 0n, 1n],
        ),
      }),
    ).toBeUndefined();
  });
});
