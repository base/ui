import { describe, expect, it } from 'vitest';

import {
  blocksAfterSendLabel,
  formatInclusion,
  inclusionFromChain,
  latencyLabel,
  quantityToNumber,
  slotLabel,
} from './inclusion';

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

describe('inclusionFromChain', () => {
  // Block 136,202 stamped at 1_788_419_125_000; the head seen at broadcast was
  // 136,201 stamped 200 ms earlier.
  const receipt = { blockNumber: '0x2140a' };
  const block = { timestampMs: '0x1a066162f08' };

  it('measures chain time between the block seen at broadcast and the inclusion block', () => {
    expect(inclusionFromChain(receipt, block, { number: 136_201, timestampMs: 1_788_419_124_800 })).toEqual({
      blockNumber: 136_202,
      blockTimestampMs: 1_788_419_125_000,
      chainMs: 200,
      blocksAfterSend: 1,
    });
  });

  it('counts two slots when the transaction missed the next block', () => {
    expect(inclusionFromChain(receipt, block, { number: 136_200, timestampMs: 1_788_419_124_600 })).toEqual({
      blockNumber: 136_202,
      blockTimestampMs: 1_788_419_125_000,
      chainMs: 400,
      blocksAfterSend: 2,
    });
  });

  it('accepts the block timestamp already parsed, as the head stream delivers it', () => {
    expect(
      inclusionFromChain(receipt, { timestampMs: 1_788_419_125_000 }, { number: 136_201, timestampMs: 1_788_419_124_800 }),
    ).toMatchObject({ blockTimestampMs: 1_788_419_125_000, chainMs: 200 });
  });

  it('reports block and slot only without a block seen at broadcast', () => {
    expect(inclusionFromChain(receipt, block, null)).toEqual({
      blockNumber: 136_202,
      blockTimestampMs: 1_788_419_125_000,
      chainMs: null,
      blocksAfterSend: null,
    });
  });

  it('derives chain time from the block count when the anchor has no millisecond timestamp', () => {
    expect(inclusionFromChain(receipt, block, { number: 136_199, timestampMs: null })).toMatchObject({
      chainMs: 600,
      blocksAfterSend: 3,
    });
  });

  it('gives no latency when the anchor is at or ahead of the inclusion block', () => {
    expect(inclusionFromChain(receipt, block, { number: 136_202, timestampMs: 1_788_419_125_000 })).toMatchObject({
      chainMs: null,
      blocksAfterSend: null,
    });
    expect(inclusionFromChain(receipt, block, { number: 136_205, timestampMs: 1_788_419_125_600 })).toMatchObject({
      chainMs: null,
      blocksAfterSend: null,
    });
  });

  it('omits the slot when the block has no millisecond timestamp (pre-Cobalt)', () => {
    expect(inclusionFromChain({ blockNumber: '0x10' }, {}, { number: 15, timestampMs: null })).toEqual({
      blockNumber: 16,
      blockTimestampMs: null,
      chainMs: 200,
      blocksAfterSend: 1,
    });
    expect(inclusionFromChain({ blockNumber: '0x10' }, null, null)?.blockTimestampMs).toBeNull();
  });

  it('returns null without a block number', () => {
    expect(inclusionFromChain(null, block, null)).toBeNull();
    expect(inclusionFromChain({}, block, null)).toBeNull();
  });
});

describe('slotLabel', () => {
  it('names the 200 ms slot inside the second', () => {
    expect(slotLabel(1_788_419_137_000)).toBe('.000');
    expect(slotLabel(1_788_419_137_200)).toBe('.200');
    expect(slotLabel(1_788_419_137_800)).toBe('.800');
  });

  it('is absent without Cobalt metadata', () => {
    expect(slotLabel(null)).toBeNull();
  });
});

describe('latencyLabel', () => {
  it('uses milliseconds under a second and seconds from a second up', () => {
    expect(latencyLabel(400)).toBe('400 ms');
    expect(latencyLabel(999.6)).toBe('1.0 s');
    expect(latencyLabel(1_840)).toBe('1.8 s');
  });
});

describe('blocksAfterSendLabel', () => {
  it('pluralises the block count', () => {
    expect(blocksAfterSendLabel({ blocksAfterSend: 1 })).toBe('1 block');
    expect(blocksAfterSendLabel({ blocksAfterSend: 3 })).toBe('3 blocks');
  });

  it('is absent without an anchor', () => {
    expect(blocksAfterSendLabel({ blocksAfterSend: null })).toBeNull();
  });
});

describe('formatInclusion', () => {
  it('joins latency, block, and slot', () => {
    expect(
      formatInclusion({ blockNumber: 136_522, blockTimestampMs: 1_788_419_191_400, chainMs: 400, blocksAfterSend: 2 }),
    ).toBe('Landed in 400 ms · block 136,522 · .400');
  });

  it('drops the slot when there is no millisecond timestamp', () => {
    expect(formatInclusion({ blockNumber: 16, blockTimestampMs: null, chainMs: 1_600, blocksAfterSend: 8 })).toBe(
      'Landed in 1.6 s · block 16',
    );
  });

  it('drops the latency when no block was seen at broadcast', () => {
    expect(
      formatInclusion({ blockNumber: 136_522, blockTimestampMs: 1_788_419_191_400, chainMs: null, blocksAfterSend: null }),
    ).toBe('block 136,522 · .400');
  });
});
