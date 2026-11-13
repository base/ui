import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import { mergeBlockWindow } from './block-window';
import type { BlockSummary } from './types';

function block(number: number, hash = `0x${number.toString(16)}`): BlockSummary {
  return {
    hash,
    number,
    timestamp: 1_800_000_000,
    timestampMs: null,
    transactionCount: 2,
    gasUsed: null,
    gasLimit: null,
    baseFeePerGas: null,
  };
}

const numbers = (blocks: BlockSummary[]) => blocks.map((b) => b.number);

describe('mergeBlockWindow', () => {
  test('keeps the newest blocks first and trims to the limit', () => {
    const current = [block(12), block(11), block(10)];
    assert.deepEqual(numbers(mergeBlockWindow(current, [block(13)], 3)), [13, 12, 11]);
  });

  test('places out-of-order heads by height', () => {
    const merged = mergeBlockWindow([block(13), block(11)], [block(12)], 10);
    assert.deepEqual(numbers(merged), [13, 12, 11]);
  });

  test('replaces a block at the same height with the incoming one', () => {
    const merged = mergeBlockWindow([block(12, '0xold'), block(11)], [block(12, '0xnew')], 10);
    assert.deepEqual(
      merged.map((b) => b.hash),
      ['0xnew', '0xb'],
    );
  });

  test('keeps streamed heads newer than a late polled snapshot', () => {
    const streamed = [block(20), block(19)];
    const snapshot = [block(18), block(17), block(16)];
    assert.deepEqual(numbers(mergeBlockWindow(streamed, snapshot, 4)), [20, 19, 18, 17]);
  });

  test('a repeated head keeps details already filled for that block', () => {
    const filled = { ...block(12), timestampMs: 1_800_000_000_400 };
    const header = { ...block(12), transactionCount: null };
    const [merged] = mergeBlockWindow([filled], [header], 10);
    assert.equal(merged.transactionCount, 2);
    assert.equal(merged.timestampMs, 1_800_000_000_400);
  });
});
