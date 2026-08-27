import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import {
  findLatestActiveBlock,
  hasNonSystemTransaction,
  isSystemSender,
  parseActiveBlockQuery,
  SYSTEM_SENDER_ADDRESS,
  type HashOnlyBlock,
} from './active-block';

const USER = '0x354ab0061abf60939948bf3b000f570f3eccb2be';

function hashBlock(number: number, transactionCount: number): HashOnlyBlock {
  return {
    hash: `0x${number.toString(16).padStart(64, '0')}`,
    number,
    transactionCount,
  };
}

describe('system senders', () => {
  test('treats the system sender as system and anyone else as a user', () => {
    assert.equal(isSystemSender(SYSTEM_SENDER_ADDRESS), true);
    assert.equal(isSystemSender(SYSTEM_SENDER_ADDRESS.toUpperCase()), true);
    assert.equal(isSystemSender(USER), false);
    assert.equal(isSystemSender(null), false);
    assert.equal(hasNonSystemTransaction([{ from: SYSTEM_SENDER_ADDRESS }]), false);
    assert.equal(
      hasNonSystemTransaction([{ from: SYSTEM_SENDER_ADDRESS }, { from: USER }]),
      true,
    );
  });
});

describe('parseActiveBlockQuery', () => {
  test('treats a missing before as chain head', () => {
    assert.deepEqual(parseActiveBlockQuery(new URLSearchParams()), { before: null });
  });

  test('parses before as an exclusive upper bound', () => {
    assert.deepEqual(parseActiveBlockQuery(new URLSearchParams('before=2726235')), {
      before: 2726235,
    });
  });

  test('rejects a non-integer before', () => {
    assert.throws(
      () => parseActiveBlockQuery(new URLSearchParams('before=-1')),
      /before must be a non-negative integer/,
    );
  });
});

describe('findLatestActiveBlock', () => {
  test('returns the newest block that has a non-system sender', async () => {
    const loaded: number[][] = [];
    const found = await findLatestActiveBlock({
      latestBlockNumber: 10,
      batchSize: 4,
      maxBlocks: 20,
      loadHashBlocks: async (numbers) => {
        loaded.push(numbers);
        return numbers.map((number) =>
          hashBlock(number, number === 7 || number === 3 ? 4 : 1),
        );
      },
      loadSenders: async (blockNumber) => {
        if (blockNumber === 7) return [{ from: SYSTEM_SENDER_ADDRESS }, { from: USER }];
        if (blockNumber === 3) return [{ from: SYSTEM_SENDER_ADDRESS }, { from: USER }];
        return [{ from: SYSTEM_SENDER_ADDRESS }];
      },
    });

    assert.deepEqual(found, { hash: hashBlock(7, 4).hash, number: 7 });
    assert.deepEqual(loaded[0], [10, 9, 8, 7]);
  });

  test('skips multi-tx blocks that are still all system sends', async () => {
    const found = await findLatestActiveBlock({
      latestBlockNumber: 5,
      batchSize: 10,
      loadHashBlocks: async (numbers) =>
        numbers.map((number) => hashBlock(number, number === 5 ? 2 : 1)),
      loadSenders: async (blockNumber) =>
        blockNumber === 5
          ? [{ from: SYSTEM_SENDER_ADDRESS }, { from: SYSTEM_SENDER_ADDRESS }]
          : [{ from: SYSTEM_SENDER_ADDRESS }],
    });
    assert.equal(found, null);
  });

  test('starts below the given head so a previous search skips newer active blocks', async () => {
    const found = await findLatestActiveBlock({
      latestBlockNumber: 6,
      batchSize: 10,
      loadHashBlocks: async (numbers) =>
        numbers.map((number) => hashBlock(number, number === 7 || number === 3 ? 4 : 1)),
      loadSenders: async (blockNumber) =>
        blockNumber === 7 || blockNumber === 3
          ? [{ from: SYSTEM_SENDER_ADDRESS }, { from: USER }]
          : [{ from: SYSTEM_SENDER_ADDRESS }],
    });
    assert.deepEqual(found, { hash: hashBlock(3, 4).hash, number: 3 });
  });

  test('stops after maxBlocks even if an older active block exists', async () => {
    const found = await findLatestActiveBlock({
      latestBlockNumber: 20,
      batchSize: 5,
      maxBlocks: 6,
      loadHashBlocks: async (numbers) =>
        numbers.map((number) => hashBlock(number, number === 10 ? 3 : 1)),
      loadSenders: async () => [{ from: SYSTEM_SENDER_ADDRESS }, { from: USER }],
    });
    assert.equal(found, null);
  });
});
