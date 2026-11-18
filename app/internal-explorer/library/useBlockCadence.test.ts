import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import { resolveBlockCadence } from './useBlockCadence';

describe('resolveBlockCadence', () => {
  test('maps known values to their redraw interval', () => {
    assert.equal(resolveBlockCadence('live').intervalMs, 0);
    assert.equal(resolveBlockCadence('2s').intervalMs, 2_000);
  });

  test('defaults to 1s for missing or unknown values', () => {
    assert.equal(resolveBlockCadence(null).value, '1s');
    assert.equal(resolveBlockCadence('5s').value, '1s');
    assert.equal(resolveBlockCadence(null).intervalMs, 1_000);
  });
});
