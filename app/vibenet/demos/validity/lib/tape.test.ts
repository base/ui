import { encodeAbiParameters, encodeEventTopics, parseAbi, zeroAddress } from 'viem';
import { describe, expect, it } from 'vitest';

import { CANDLE_SAMPLE_MS, CANDLE_WINDOW_MS, WAD } from './constants';
import {
  mergeTape,
  needsLogBackfill,
  parseTapeSamples,
  resetTapeStore,
  samplesFromSyncLogs,
  tapeCoverageMs,
  writeTape,
} from './tape';

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

describe('parseTapeSamples', () => {
  it('keeps finite positive prices', () => {
    expect(
      parseTapeSamples([
        { t: 1, price: 0.07 },
        { t: 'nope', price: 1 },
        { t: 2, price: 0 },
        { price: 1 },
      ]),
    ).toEqual([{ t: 1, price: 0.07 }]);
  });
});

describe('tape store', () => {
  it('holds samples across write/read for one pair', () => {
    resetTapeStore();
    const pair = '0x00000000000000000000000000000000000000aa' as const;
    const now = Date.now();
    writeTape(pair, [{ t: now - 1_000, price: 0.07 }]);
    expect(writeTape(pair, [{ t: now - 200, price: 0.071 }]).map((row) => row.price)).toEqual([
      0.07,
      0.071,
    ]);
    resetTapeStore();
  });
});

describe('needsLogBackfill', () => {
  it('asks for logs until the in-memory tape covers most of the window', () => {
    const now = 20_000_000;
    expect(needsLogBackfill([], now)).toBe(true);
    expect(
      needsLogBackfill(
        [
          { t: now - CANDLE_WINDOW_MS, price: 0.07 },
          { t: now, price: 0.07 },
        ],
        now,
      ),
    ).toBe(false);
    expect(tapeCoverageMs([{ t: now - 1_000, price: 0.07 }], now)).toBe(0);
  });
});

describe('samplesFromSyncLogs', () => {
  it('turns Sync reserves into mids stamped from the latest block', () => {
    const abi = parseAbi(['event Sync(uint112 reserve0, uint112 reserve1)']);
    const [topic] = encodeEventTopics({ abi, eventName: 'Sync' });
    const pair = '0x00000000000000000000000000000000000000aa' as const;
    const logs = [
      {
        address: pair,
        topics: [topic],
        data: encodeAbiParameters(
          [{ type: 'uint112' }, { type: 'uint112' }],
          [2_000_000n * WAD, 140_000n * WAD],
        ),
        blockNumber: '0x64',
      },
    ];
    const samples = samplesFromSyncLogs({
      logs,
      pair,
      vibeToken0: true,
      latestBlock: 0x6en,
      now: 5_000,
    });
    expect(samples).toHaveLength(1);
    expect(samples[0].price).toBeCloseTo(0.07, 8);
    expect(samples[0].t).toBe(5_000 - 10 * 200);
    expect(
      samplesFromSyncLogs({
        logs,
        pair: zeroAddress,
        vibeToken0: true,
        latestBlock: 0x6en,
        now: 5_000,
      }),
    ).toEqual([]);
  });
});
