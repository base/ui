import { describe, expect, it } from 'vitest';

import { formatInclusion, inclusionFromBlock, latencyLabel, quantityToNumber, slotLabel } from './inclusion';

describe('quantityToNumber', () => {
  it('parses hex quantities', () => {
    expect(quantityToNumber('0x2140a')).toBe(136_202);
    expect(quantityToNumber('0x0')).toBe(0);
  });

  it('rejects non-quantities', () => {
    expect(quantityToNumber(undefined)).toBeNull();
    expect(quantityToNumber('136202')).toBeNull();
    expect(quantityToNumber('')).toBeNull();
  });
});

describe('inclusionFromBlock', () => {
  it('measures latency from the block clock when Denim timestampMs is present', () => {
    // Sent at .718, block stamped at the next .000 → 282 ms, regardless of how
    // late the receipt was observed (1.4 s here, mostly polling round trips).
    const inclusion = inclusionFromBlock(
      { number: '0x2140a', timestampMs: '0x1a066162f08' },
      1_788_419_124_718,
      1_788_419_126_120,
    );
    expect(inclusion).toEqual({ blockNumber: 136_202, blockTimestampMs: 1_788_419_125_000, inclusionMs: 282 });
  });

  it('falls back to observed time when the block has no millisecond timestamp (pre-Denim)', () => {
    const inclusion = inclusionFromBlock({ number: '0x10' }, 0, 250);
    expect(inclusion).toEqual({ blockNumber: 16, blockTimestampMs: null, inclusionMs: 250 });
  });

  it('returns null without a block number', () => {
    expect(inclusionFromBlock(null, 0, 1)).toBeNull();
    expect(inclusionFromBlock({}, 0, 1)).toBeNull();
  });

  it('never reports negative latency when clocks skew', () => {
    expect(inclusionFromBlock({ number: '0x1' }, 500, 400)?.inclusionMs).toBe(0);
    expect(inclusionFromBlock({ number: '0x1', timestampMs: '0x64' }, 500, 900)?.inclusionMs).toBe(0);
  });
});

describe('slotLabel', () => {
  it('names the 200 ms slot inside the second', () => {
    expect(slotLabel(1_788_419_137_000)).toBe('.000');
    expect(slotLabel(1_788_419_137_200)).toBe('.200');
    expect(slotLabel(1_788_419_137_800)).toBe('.800');
  });

  it('is absent without Denim metadata', () => {
    expect(slotLabel(null)).toBeNull();
  });
});

describe('latencyLabel', () => {
  it('uses milliseconds under a second and seconds above', () => {
    expect(latencyLabel(412)).toBe('412 ms');
    expect(latencyLabel(999.6)).toBe('1000 ms');
    expect(latencyLabel(1_840)).toBe('1.8 s');
  });
});

describe('formatInclusion', () => {
  it('joins latency, block, and slot', () => {
    expect(
      formatInclusion({ blockNumber: 136_522, blockTimestampMs: 1_788_419_191_400, inclusionMs: 412 }),
    ).toBe('Landed in 412 ms · block 136,522 · .400');
  });

  it('drops the slot when there is no millisecond timestamp', () => {
    expect(formatInclusion({ blockNumber: 16, blockTimestampMs: null, inclusionMs: 1_500 })).toBe(
      'Landed in 1.5 s · block 16',
    );
  });
});
