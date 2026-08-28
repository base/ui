import { describe, expect, it } from 'vitest';

import { headNumber } from './stream';

describe('headNumber', () => {
  it('reads a hex block number', () => {
    expect(headNumber({ number: '0x6fb4' })).toBe(28596n);
  });

  it('rejects a missing number', () => {
    expect(headNumber({ number: 'nope' as `0x${string}` })).toBeNull();
  });
});
