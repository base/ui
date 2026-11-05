import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import {
  blockNumbersForPage,
  nextBlockCursor,
  parseBlockListQuery,
  parseBlockSummary,
} from './block-list';

describe('parseBlockSummary', () => {
  const rpcBlock = {
    hash: `0x${'ab'.repeat(32)}`,
    number: '0x10',
    timestamp: '0x6b49d200',
    transactions: [`0x${'01'.repeat(32)}`, `0x${'02'.repeat(32)}`],
    gasUsed: '0x5208',
    gasLimit: '0x7270e00',
    baseFeePerGas: '0x1',
  };

  test('reads the Denim millisecond timestamp when present', () => {
    const summary = parseBlockSummary({ ...rpcBlock, timestampMs: '0x1a3185c50c8' });
    assert.equal(summary?.timestampMs, 1_800_000_000_200);
    assert.equal(summary?.timestamp, 1_800_000_000);
    assert.equal(summary?.transactionCount, 2);
  });

  test('leaves timestampMs null for blocks without it', () => {
    assert.equal(parseBlockSummary(rpcBlock)?.timestampMs, null);
  });

  test('leaves transactionCount null for a header without a transaction list', () => {
    const { transactions: _transactions, ...header } = rpcBlock;
    assert.equal(parseBlockSummary(header)?.transactionCount, null);
  });

  test('rejects malformed blocks', () => {
    assert.equal(parseBlockSummary(null), null);
    assert.equal(parseBlockSummary({ ...rpcBlock, number: undefined }), null);
  });
});

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
