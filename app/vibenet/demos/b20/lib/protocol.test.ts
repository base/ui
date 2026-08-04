import { describe, expect, it } from 'vitest';

import { b20Variant, encodeDeploymentParams, memoToBytes32, saltFor } from './protocol';

describe('B20 demo protocol helpers', () => {
  it('reads the variant byte from a B20-shaped address', () => {
    const asset = `0xb200${'0'.repeat(36)}` as `0x${string}`;
    const stablecoin = `0xb200${'0'.repeat(16)}01${'0'.repeat(18)}` as `0x${string}`;
    expect(b20Variant(asset)).toBe('asset');
    expect(b20Variant(stablecoin)).toBe('stablecoin');
    expect(b20Variant(`0x${'1'.repeat(40)}` as `0x${string}`)).toBeNull();
  });

  it('encodes bounded text memos as bytes32 and preserves raw bytes32', () => {
    expect(memoToBytes32('order-42')).toMatch(/^0x6f726465722d3432[0]{48}$/);
    const raw = `0x${'ab'.repeat(32)}` as `0x${string}`;
    expect(memoToBytes32(raw)).toBe(raw);
    expect(() => memoToBytes32('x'.repeat(33))).toThrow(/32 UTF-8 bytes/);
  });

  it('uses canonical ABI tuple encodings for both Factory variants', () => {
    const account = '0x1111111111111111111111111111111111111111' as const;
    expect(encodeDeploymentParams('asset', 'Asset', 'AST', account, 18, '')).toMatch(/^0x/);
    expect(encodeDeploymentParams('stablecoin', 'Dollar', 'USD', account, 6, 'USD')).toMatch(/^0x/);
    expect(saltFor('issuer-salt')).toEqual(saltFor('issuer-salt'));
  });
});
