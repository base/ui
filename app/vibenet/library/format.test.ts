import { describe, expect, it } from 'vitest';

import { formatAmount } from './format';

describe('formatAmount', () => {
  it('formats positive fractional amounts', () => {
    expect(formatAmount('1500000000000000000', 18)).toBe('1.5');
  });

  it('keeps the sign separate when formatting negative amounts', () => {
    expect(formatAmount('-1500000000000000000', 18)).toBe('-1.5');
    expect(formatAmount('-500000000000000000', 18)).toBe('-0.5');
  });

  it('returns the original raw value when it cannot parse an amount', () => {
    expect(formatAmount('not-a-number', 18)).toBe('not-a-number');
  });
});
