import { describe, expect, it } from 'vitest';
import { decodeAbiParameters, keccak256, parseUnits, stringToHex } from 'viem';

import {
  amount,
  b20Variant,
  bytes32ToMemo,
  encodeDeploymentParams,
  featureId,
  formatAmount,
  memoToBytes32,
  ROLES,
  saltFor,
  shortAddress,
} from './protocol';

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

  it('handles the memo length boundary and the empty memo', () => {
    // Exactly 32 bytes must be accepted (no truncation, no padding).
    expect(memoToBytes32('x'.repeat(32))).toBe(`0x${'78'.repeat(32)}`);
    // Empty memo encodes to the zero word.
    expect(memoToBytes32('')).toBe(`0x${'0'.repeat(64)}`);
  });

  it('uses canonical ABI tuple encodings for both Factory variants', () => {
    const account = '0x1111111111111111111111111111111111111111' as const;
    const asset = decodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            { type: 'uint8' },
            { type: 'string' },
            { type: 'string' },
            { type: 'address' },
            { type: 'uint8' },
          ],
        },
      ],
      encodeDeploymentParams('asset', 'Asset', 'AST', account, 18, ''),
    );
    const stablecoin = decodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            { type: 'uint8' },
            { type: 'string' },
            { type: 'string' },
            { type: 'address' },
            { type: 'string' },
          ],
        },
      ],
      encodeDeploymentParams('stablecoin', 'Dollar', 'USD', account, 6, 'USD'),
    );
    expect(asset[0]).toEqual([1, 'Asset', 'AST', account, 18]);
    expect(stablecoin[0]).toEqual([1, 'Dollar', 'USD', account, 'USD']);
    expect(saltFor('issuer-salt')).toEqual(saltFor('issuer-salt'));
  });

  it('uses the current B20 role taxonomy', () => {
    expect(ROLES).toContain('BURN_BLOCKED_ROLE');
    expect(ROLES).not.toContain('SEIZE_ROLE' as never);
  });

  it('parses amounts and rejects empty or negative input', () => {
    expect(amount('1.5', 18)).toBe(parseUnits('1.5', 18));
    expect(amount('0', 18)).toBe(0n);
    expect(amount('100', 6)).toBe(100_000_000n);
    expect(() => amount('', 18)).toThrow(/non-negative/);
    expect(() => amount('-1', 18)).toThrow(/non-negative/);
  });

  it('derives distinct, deterministic feature ids per variant', () => {
    expect(featureId('asset')).toBe(keccak256(stringToHex('base.b20_asset')));
    expect(featureId('stablecoin')).toBe(keccak256(stringToHex('base.b20_stablecoin')));
    expect(featureId('asset')).not.toBe(featureId('stablecoin'));
  });

  it('shortens long addresses and leaves short values intact', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
    expect(shortAddress('short')).toBe('short');
  });

  it('formats token amounts, grouping the whole part and trimming zeros', () => {
    expect(formatAmount(0n, 18)).toBe('0');
    expect(formatAmount(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    expect(formatAmount(1_234_000_000n, 6)).toBe('1,234');
    // Fraction is capped at 6 places.
    expect(formatAmount(1_123_456_789_000_000_000n, 18)).toBe('1.123456');
  });

  it('round-trips text memos through bytes32 and rejects non-text', () => {
    expect(bytes32ToMemo(memoToBytes32('order-42'))).toBe('order-42');
    expect(bytes32ToMemo(memoToBytes32('x'.repeat(32)))).toBe('x'.repeat(32));
    // Empty memo (all-zero word) decodes to null, not an empty string.
    expect(bytes32ToMemo(`0x${'0'.repeat(64)}`)).toBeNull();
    // Non-printable bytes decode to null so callers can show the raw hex.
    expect(bytes32ToMemo(`0x${'ff'.repeat(32)}`)).toBeNull();
  });
});
