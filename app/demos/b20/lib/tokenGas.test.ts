import { describe, expect, it } from 'vitest';

import { canUseTokenForGas } from './tokenGas';

describe('B20 token gas eligibility', () => {
  it('allows a managed Stablecoin to pay gas', () => {
    expect(canUseTokenForGas('stablecoin', true, false)).toBe(true);
    expect(canUseTokenForGas('stablecoin', false, true)).toBe(true);
  });

  it('never allows an Asset token to pay gas', () => {
    expect(canUseTokenForGas('asset', true, false)).toBe(false);
    expect(canUseTokenForGas('asset', false, true)).toBe(false);
    expect(canUseTokenForGas('asset', true, true)).toBe(false);
  });

  it('requires access to the selected Stablecoin', () => {
    expect(canUseTokenForGas('stablecoin', false, false)).toBe(false);
    expect(canUseTokenForGas(undefined, true, true)).toBe(false);
  });
});
