import { describe, expect, it } from 'vitest';

import { amountOut, amountOutAtLimit } from './amm';
import { SEED_USDV, SEED_VIBE, WAD } from './constants';

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
    const spot = (SEED_USDV * WAD) / SEED_VIBE;
    const limit = (spot * 98n) / 100n;
    const amountIn = 800n * WAD;
    const atSpot = amountOut(amountIn, SEED_USDV, SEED_VIBE);
    const atLimit = amountOutAtLimit(amountIn, 'buy', k, limit);
    expect(atLimit).toBeGreaterThan(atSpot);
    const fill = (amountIn * WAD) / atLimit;
    expect(fill).toBeLessThan((amountIn * WAD) / atSpot);
    expect(((fill - limit) * 10_000n) / limit).toBeLessThan(100n);
  });
});
