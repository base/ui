import { describe, expect, it } from 'vitest';

import { shouldUseDelegatedMemoTransfer } from './memoTransfer';

describe('B20 memo transfer selection', () => {
  it('always uses a direct transfer for Stablecoins', () => {
    expect(shouldUseDelegatedMemoTransfer('stablecoin', false, true)).toBe(false);
    expect(shouldUseDelegatedMemoTransfer('stablecoin', true, true)).toBe(false);
  });

  it('preserves the delegated transfer option for Assets', () => {
    expect(shouldUseDelegatedMemoTransfer('asset', true, true)).toBe(true);
    expect(shouldUseDelegatedMemoTransfer('asset', false, true)).toBe(false);
    expect(shouldUseDelegatedMemoTransfer('asset', true, false)).toBe(false);
  });
});
