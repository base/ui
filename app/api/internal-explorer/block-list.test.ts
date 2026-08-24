import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import { blockNumbersForPage, nextBlockCursor, parseBlockListQuery } from './block-list';

describe('block list pagination', () => {
  test('starts at the inclusive cursor', () => {
    assert.deepEqual(blockNumbersForPage(100, 90, 3), [90, 89, 88]);
    assert.deepEqual(blockNumbersForPage(100, null, 3), [100, 99, 98]);
  });

  test('does not move below genesis', () => {
    assert.deepEqual(blockNumbersForPage(2, 1, 10), [1, 0]);
    assert.equal(nextBlockCursor([{ number: 1 }, { number: 0 }]), null);
    assert.equal(nextBlockCursor([{ number: 10 }]), 9);
  });

  test('validates cursors and limits', () => {
    assert.deepEqual(parseBlockListQuery(new URLSearchParams('cursor=90&limit=25')), {
      cursor: 90,
      limit: 25,
    });
    assert.throws(
      () => parseBlockListQuery(new URLSearchParams('cursor=-1')),
      /cursor must be a non-negative integer/,
    );
    assert.throws(
      () => parseBlockListQuery(new URLSearchParams('limit=101')),
      /limit must be between/,
    );
  });
});
