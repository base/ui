import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import {
  calculateTransactionFee,
  formatAction,
  formatAge,
  formatEth,
  formatGwei,
  formatInteger,
  formatLatency,
  shortAddress,
} from './explorer-format';

describe('explorer formatters', () => {
  test('formats decimal quantities without hexadecimal output', () => {
    assert.equal(formatInteger('21000'), '21,000');
    assert.equal(formatGwei('5000000000'), '5 Gwei');
    assert.equal(formatEth('1234567890000000000'), '1.234567 ETH');
    assert.equal(calculateTransactionFee('21000', '1000000000'), 21000000000000n);
    assert.equal(calculateTransactionFee(null, '1000000000'), null);
  });

  test('formats ages from unix timestamps', () => {
    assert.equal(formatAge(1_000, 1_000), 'now');
    assert.equal(formatAge(940, 1_000), '1m ago');
    assert.equal(formatAge(1_000 - 86_400 * 2, 1_000), '2d ago');
  });

  test('uses safe action fallbacks', () => {
    assert.equal(formatAction('0x', '0xto'), 'Transfer');
    assert.equal(formatAction('0x', null), 'Contract Creation');
    assert.equal(formatAction('0xa9059cbb0000', '0xto'), '0xa9059cbb');
    assert.equal(formatAction('not-calldata', '0xto'), 'Contract Call');
  });

  test('formats inclusion latencies in milliseconds or seconds', () => {
    assert.equal(formatLatency(350), '350 ms');
    assert.equal(formatLatency(999), '999 ms');
    assert.equal(formatLatency(1350), '1.35 s');
  });

  test('shortens addresses without changing their identity', () => {
    assert.equal(shortAddress('0x1234567890abcdef'), '0x1234...cdef');
    assert.equal(shortAddress(null), '—');
  });
});
