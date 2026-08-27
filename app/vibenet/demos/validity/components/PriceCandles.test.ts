import { describe, expect, it } from 'vitest';

import { isUpCandle, toCandles, type PriceSample } from './PriceCandles';

describe('toCandles', () => {
  it('builds a wick when price reverses inside a 2s bucket', () => {
    const t0 = 1_000_000;
    const samples: PriceSample[] = [
      { t: t0, price: 1.0 },
      { t: t0 + 400, price: 1.03 },
      { t: t0 + 800, price: 0.98 },
      { t: t0 + 1_200, price: 1.01 },
    ];
    const [candle] = toCandles(samples);
    expect(candle.o).toBe(1.0);
    expect(candle.c).toBe(1.01);
    expect(candle.h).toBe(1.03);
    expect(candle.l).toBe(0.98);
    expect(candle.h).toBeGreaterThan(Math.max(candle.o, candle.c));
    expect(candle.l).toBeLessThan(Math.min(candle.o, candle.c));
  });

  it('stays a doji when every sample is the same price', () => {
    const t0 = 1_000_000;
    const samples: PriceSample[] = [
      { t: t0, price: 1.008 },
      { t: t0 + 400, price: 1.008 },
      { t: t0 + 800, price: 1.008 },
    ];
    const [candle] = toCandles(samples);
    expect(candle.o).toBe(candle.h);
    expect(candle.h).toBe(candle.l);
    expect(candle.l).toBe(candle.c);
  });

  it('opens each bucket at the previous close so a dump is red', () => {
    const t0 = 2_000_000;
    const samples: PriceSample[] = [
      { t: t0, price: 0.08 },
      { t: t0 + 2_000, price: 0.078 },
      { t: t0 + 2_400, price: 0.0784 },
    ];
    const candles = toCandles(samples);
    expect(candles).toHaveLength(2);
    expect(candles[1].o).toBe(0.08);
    expect(candles[1].c).toBe(0.0784);
    expect(isUpCandle(candles[1], candles[0])).toBe(false);
  });
});

describe('isUpCandle', () => {
  it('colors a flat candle from the prior close, not as a default green', () => {
    const prev = { t: 0, o: 0.08, h: 0.08, l: 0.08, c: 0.079 };
    const flat = { t: 2_000, o: 0.079, h: 0.079, l: 0.079, c: 0.079 };
    expect(isUpCandle(flat, prev)).toBe(true);
    const lower = { t: 4_000, o: 0.078, h: 0.078, l: 0.078, c: 0.078 };
    expect(isUpCandle(lower, flat)).toBe(false);
  });
});
