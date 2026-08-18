import { describe, expect, it } from 'vitest';

import { POLICY_SCOPES } from './protocol';
import { SAMPLE_MEMOS, SAMPLE_TOKEN, sampleTokenForAddress } from './samples';

describe('B20 sample data', () => {
  it('resolves only the local sample token address, regardless of casing', () => {
    expect(sampleTokenForAddress(SAMPLE_TOKEN.address)).toBe(SAMPLE_TOKEN);
    expect(sampleTokenForAddress(SAMPLE_TOKEN.address.toUpperCase())).toBe(SAMPLE_TOKEN);
    expect(sampleTokenForAddress('0x1111111111111111111111111111111111111111')).toBeNull();
    expect(sampleTokenForAddress(undefined)).toBeNull();
  });

  it('provides a complete read-only policy and memo walkthrough', () => {
    expect(SAMPLE_TOKEN.policies.map((policy) => policy.scope)).toEqual(POLICY_SCOPES.map(([scope]) => scope));
    expect(SAMPLE_TOKEN.policies.filter((policy) => policy.id !== 0n)).toHaveLength(2);
    expect(SAMPLE_TOKEN.policies.every((policy) => policy.exists)).toBe(true);
    expect(SAMPLE_MEMOS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'transfer', memo: 'sending test', value: 1_000_000_000_000_000n }),
      ]),
    );
  });
});
