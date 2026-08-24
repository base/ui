import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import {
  formatTransactionCursor,
  parseTransactionCursor,
  parseTransactionListQuery,
} from './transaction-list';

describe('transaction list cursors', () => {
  test('round-trips compound positions', () => {
    const position = parseTransactionCursor('100:7');
    assert.deepEqual(position, { blockNumber: 100, transactionIndex: 7 });
    assert.equal(
      formatTransactionCursor(position ?? { blockNumber: 0, transactionIndex: 0 }),
      '100:7',
    );
  });

  test('rejects malformed cursors', () => {
    assert.throws(() => parseTransactionCursor('100'), /blockNumber:transactionIndex/);
    assert.throws(
      () => parseTransactionCursor('100:-1'),
      /transaction index must be a non-negative integer/,
    );
    assert.throws(() => parseTransactionCursor('100:1:2'), /blockNumber:transactionIndex/);
  });

  test('parses bounded page sizes', () => {
    assert.deepEqual(parseTransactionListQuery(new URLSearchParams('limit=50&cursor=100:7')), {
      limit: 50,
      cursor: { blockNumber: 100, transactionIndex: 7 },
    });
    assert.throws(
      () => parseTransactionListQuery(new URLSearchParams('limit=101')),
      /limit must be between/,
    );
  });
});
