import { describe, expect, it } from 'vitest';

import { BOT_GAS_FLOOR, allNeedGas, botNeedsGas, fractionForPriceMove, makerTargetPrice, planSwap } from './bots';

describe('fractionForPriceMove', () => {
  it('sizes a 1% price step at about half a percent of reserves', () => {
    const fraction = fractionForPriceMove(0.01);
    expect(fraction).toBeGreaterThan(0.0045);
    expect(fraction).toBeLessThan(0.0056);
  });
});

describe('makerTargetPrice', () => {
  it('wanders around the VIBE/USDV anchor inside $0.01–$1', () => {
    const prices = Array.from({ length: 120 }, (_, i) => makerTargetPrice(i * 250, 0.07));
    expect(Math.max(...prices) / Math.min(...prices)).toBeGreaterThan(1.02);
    expect(Math.min(...prices)).toBeGreaterThan(0.01);
    expect(Math.max(...prices)).toBeLessThan(1);
    expect(prices.some((price) => price < 0.07)).toBe(true);
    expect(prices.some((price) => price > 0.07)).toBe(true);
  });
});

describe('planSwap', () => {
  it('sizes near a 1% price impact', () => {
    const plan = planSwap(0.08, 0.07, 0);
    expect(plan.fraction).toBeGreaterThan(0.0045);
    expect(plan.fraction).toBeLessThan(0.0056);
  });

  it('buys VIBE when the quote is stretched cheap', () => {
    expect(planSwap(0.012, 0.07, 0).sellVibe).toBe(false);
  });
});

describe('botNeedsGas', () => {
  it('is true below the floor', () => {
    expect(botNeedsGas(0n)).toBe(true);
    expect(botNeedsGas(BOT_GAS_FLOOR)).toBe(false);
  });
});

describe('allNeedGas', () => {
  it('is only true when every maker is below the floor', () => {
    expect(allNeedGas([])).toBe(false);
    expect(allNeedGas([0n, BOT_GAS_FLOOR])).toBe(false);
    expect(allNeedGas([0n, BOT_GAS_FLOOR - 1n])).toBe(true);
  });
});
