import { nonceKeyMax } from '@aa';
import { describe, expect, it } from 'vitest';

import { clampNoncelessExpiry, noncelessFields } from './aa';

describe('noncelessFields', () => {
  it('uses nonceKeyMax and no sequence so concurrent txs do not replace', () => {
    const fields = noncelessFields(15, 1_700_000_000_000);
    expect(fields.nonceKey).toBe(nonceKeyMax);
    expect(fields.nonceSequence).toBe(0n);
    expect(fields.validBefore).toBe(1_700_000_015_000n);
  });

  it('clamps to the 20s nonce-free window', () => {
    expect(clampNoncelessExpiry(60)).toBe(20);
    expect(noncelessFields(60, 1_000).validBefore).toBe(21_000n);
  });
});
