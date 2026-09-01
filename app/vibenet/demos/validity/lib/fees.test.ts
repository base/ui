import { describe, expect, it } from 'vitest';

import { bumpReplacementFees, feesFromHead, isReplacementUnderpriced } from './fees';

describe('bumpReplacementFees', () => {
  it('raises tip and fee cap by at least 10%', () => {
    const prev = { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 100n };
    const next = bumpReplacementFees(prev);
    expect(next.maxFeePerGas * 10n).toBeGreaterThanOrEqual(prev.maxFeePerGas * 11n);
    expect(next.maxPriorityFeePerGas * 10n).toBeGreaterThanOrEqual(prev.maxPriorityFeePerGas * 11n);
  });

  it('takes the higher of the bump and the latest network fees', () => {
    const prev = { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 100n };
    const latest = { maxFeePerGas: 5_000n, maxPriorityFeePerGas: 800n };
    expect(bumpReplacementFees(prev, latest)).toEqual(latest);
  });
});

describe('isReplacementUnderpriced', () => {
  it('matches geth-style replacement errors', () => {
    expect(isReplacementUnderpriced(new Error('replacement transaction underpriced'))).toBe(true);
    expect(isReplacementUnderpriced(new Error('nonce too low'))).toBe(false);
  });
});

describe('feesFromHead', () => {
  it('uses 2× base fee plus the default tip', () => {
    expect(feesFromHead({ baseFeePerGas: '0x3b9aca00' })).toEqual({
      maxFeePerGas: 2_000_000_000n + 1_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
    });
  });

  it('rejects a missing base fee', () => {
    expect(feesFromHead({})).toBeNull();
  });
});
