import { describe, expect, it } from 'vitest';

import { CANDLE_BACKFILL_MS, CANDLE_WINDOW_MS, USDV_UNIT, WAD } from './constants';
import { backfillBlocks, backfillSamples, mergeTape, samplesFromSyncLogs } from './tape';

describe('mergeTape', () => {
  it('slots onto the 200ms clock and drops samples outside the window', () => {
    const now = 10_000_000;
    const merged = mergeTape(
      [{ t: now - CANDLE_WINDOW_MS - 20_000, price: 0.01 }],
      [
        { t: now - 400, price: 0.07 },
        { t: now - 200, price: 0.071 },
        { t: now + 5_000, price: 9 },
      ],
      now,
    );
    expect(merged).toEqual([
      { t: now - 400, price: 0.07 },
      { t: now - 200, price: 0.071 },
    ]);
  });
});

const logs = [{ blockNumber: 0x64n, args: { reserve0: 2_000_000n * WAD, reserve1: 140_000n * USDV_UNIT } }];

describe('backfillSamples', () => {
  it('pins a flat line across the backfill window when no Sync landed', () => {
    const now = 20_000_000;
    expect(backfillSamples({ logs: [], vibeToken0: true, latestBlock: 0x6en, now, mid: 0.07 })).toEqual([
      { t: now - CANDLE_BACKFILL_MS, price: 0.07 },
      { t: now, price: 0.07 },
    ]);
  });

  it('uses Sync history instead of the flat line when trades landed', () => {
    const now = 20_000_000;
    const samples = backfillSamples({ logs, vibeToken0: true, latestBlock: 0x6en, now, mid: 0.08 });
    expect(samples).toHaveLength(2);
    expect(samples[0].t).toBe(now - 10 * 200);
    expect(samples[0].price).toBeCloseTo(0.07, 8);
    expect(samples[1]).toEqual({ t: now, price: 0.08 });
  });

  it('looks back 10s of 200ms blocks', () => {
    expect(backfillBlocks()).toBe(50n);
  });
});

describe('samplesFromSyncLogs', () => {
  it('turns Sync reserves into mids stamped from the latest block', () => {
    const samples = samplesFromSyncLogs({ logs, vibeToken0: true, latestBlock: 0x6en, now: 5_000 });
    expect(samples).toHaveLength(1);
    expect(samples[0].price).toBeCloseTo(0.07, 8);
    expect(samples[0].t).toBe(5_000 - 10 * 200);
  });
});
