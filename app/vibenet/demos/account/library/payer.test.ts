import { describe, expect, it } from 'vitest';

import { parseDelegation } from './delegation';
import { parseTokenRate, requiredTokenAmount } from './payer';

describe('parseTokenRate', () => {
  it('reads the WAD hex rate', () => {
    expect(parseTokenRate('0x1dcd65000')).toBe(8_000_000_000n);
  });

  it('converts the legacy numerator/denominator shape to WAD', () => {
    expect(parseTokenRate({ numerator: '0x2', denominator: '0xde0b6b3a7640000' })).toBe(2n);
    expect(parseTokenRate({ numerator: '0x1', denominator: '0x0' })).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseTokenRate(undefined)).toBeNull();
    expect(parseTokenRate('not-hex')).toBeNull();
  });
});

describe('requiredTokenAmount', () => {
  it('rounds up once after multiplying', () => {
    // 100k gas at 2 gwei = 2e14 wei; at 2000 USDV (6 dp) per ETH that is 0.4 USDV.
    expect(requiredTokenAmount(100_000n, 2_000_000_000n, 2_000_000_000n)).toBe(400_000n);
    expect(requiredTokenAmount(1n, 1n, 1n)).toBe(1n);
    expect(requiredTokenAmount(0n, 1n, 1n)).toBe(0n);
  });
});

describe('parseDelegation', () => {
  const target = '0x1234567890abcdef1234567890abcdef12345678';

  it('reads a 7702 delegation designator', () => {
    expect(parseDelegation(`0xef0100${target.slice(2)}`)).toBe(target);
  });

  it('treats empty code as undelegated', () => {
    expect(parseDelegation('0x')).toBeNull();
    expect(parseDelegation(null)).toBeNull();
  });

  it('flags other code as not a delegation', () => {
    expect(parseDelegation('0x6080604052')).toBeUndefined();
  });
});
