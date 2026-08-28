import { generatePrivateKey, nonceKeyMax } from '@aa';
import { describe, expect, it } from 'vitest';

import { clampNoncelessExpiry, noncelessFields, signNoncelessCall } from './aa';

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

describe('signNoncelessCall', () => {
  it('signs a type-0x79 envelope so validity can wrap an 8130 tx', async () => {
    const { signed } = await signNoncelessCall({
      privateKey: generatePrivateKey(),
      chainId: 84538453,
      to: '0x1111111111111111111111111111111111111111',
      data: '0x',
      expiresIn: 15,
      publicClient: { getCode: async () => '0x' } as never,
    });
    expect(signed.slice(0, 4).toLowerCase()).toBe('0x79');
  });
});
