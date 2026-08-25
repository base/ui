import { describe, expect, it } from 'vitest';
import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  parseUnits,
  stringToHex,
  type Log,
} from 'viem';

import {
  amount,
  b20Variant,
  bytes32ToMemo,
  DEFAULT_ADMIN_ROLE,
  encodeDeploymentParams,
  evaluateComposite,
  featureId,
  formatAmount,
  memoToBytes32,
  normalizeInitialPolicyIds,
  normalizePolicyAdmin,
  normalizePolicyId,
  normalizePolicyMembers,
  normalizeCompositeChildIds,
  POLICY_REGISTRY,
  policyKindValue,
  policyKindFromId,
  policyUpdatesFromAssignments,
  policyRegistryAbi,
  readCreatedPolicy,
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
    expect(DEFAULT_ADMIN_ROLE).toBe(`0x${'0'.repeat(64)}`);
    expect(ROLES).toContain('BURN_BLOCKED_ROLE');
    expect(ROLES).not.toContain('SEIZE_ROLE' as never);
  });

  it('only turns entered positive policy IDs into deployment settings', () => {
    const allowlistId = ((1n << 56n) | 13n).toString();
    expect(normalizeInitialPolicyIds({})).toEqual([]);
    expect(
      normalizeInitialPolicyIds({
        TRANSFER_SENDER_POLICY: '124',
        MINT_RECEIVER_POLICY: allowlistId,
      }),
    ).toEqual([
      { scope: 'TRANSFER_SENDER_POLICY', id: 124n },
      { scope: 'MINT_RECEIVER_POLICY', id: BigInt(allowlistId) },
    ]);
    expect(() => normalizeInitialPolicyIds({ TRANSFER_SENDER_POLICY: '0' })).toThrow(/positive whole-number/);
    expect(() => normalizeInitialPolicyIds({ TRANSFER_SENDER_POLICY: '12.5' })).toThrow(/positive whole-number/);
    expect(() => normalizeInitialPolicyIds({ TRANSFER_SENDER_POLICY: '18446744073709551616' })).toThrow(
      /uint64 range/,
    );
  });

  it('validates post-deployment policy IDs while allowing ALWAYS_ALLOW when requested', () => {
    expect(normalizePolicyId('72057594037927949')).toBe(72_057_594_037_927_949n);
    expect(normalizePolicyId('0', { allowZero: true })).toBe(0n);
    expect(normalizePolicyId('18446744073709551615', { allowZero: true })).toBe((1n << 64n) - 1n);
    expect(() => normalizePolicyId('0')).toThrow(/positive whole-number/);
    expect(() => normalizePolicyId('12.5', { allowZero: true })).toThrow(/whole-number/);
    expect(() => normalizePolicyId('18446744073709551616', { allowZero: true })).toThrow(/uint64 range/);
  });

  it('maps resolved policies to token scopes and rejects conflicting assignments', () => {
    expect(
      policyUpdatesFromAssignments([
        { id: 12n, scopes: ['TRANSFER_SENDER_POLICY', 'TRANSFER_RECEIVER_POLICY'] },
        { id: 13n, scopes: ['MINT_RECEIVER_POLICY'] },
      ]),
    ).toEqual([
      { id: 12n, scope: 'TRANSFER_SENDER_POLICY' },
      { id: 12n, scope: 'TRANSFER_RECEIVER_POLICY' },
      { id: 13n, scope: 'MINT_RECEIVER_POLICY' },
    ]);
    expect(policyUpdatesFromAssignments([{ id: 12n, scopes: [] }])).toEqual([]);
    expect(() =>
      policyUpdatesFromAssignments([
        { id: 12n, scopes: ['TRANSFER_SENDER_POLICY'] },
        { id: 13n, scopes: ['TRANSFER_SENDER_POLICY'] },
      ]),
    ).toThrow(/only one policy/);
  });

  it('normalizes policy admins and member batches without treating policy IDs as addresses', () => {
    const first = '0x1111111111111111111111111111111111111111';
    const second = '0x2222222222222222222222222222222222222222';
    expect(normalizePolicyAdmin(first)).toBe(getAddress(first));
    expect(normalizePolicyMembers(`${first}\n${second}, ${first.toUpperCase().replace('0X', '0x')}`)).toEqual([
      getAddress(first),
      getAddress(second),
    ]);
    expect(normalizePolicyMembers('')).toEqual([]);
    expect(() => normalizePolicyAdmin('0x0000000000000000000000000000000000000000')).toThrow(/non-zero/);
    expect(() => normalizePolicyMembers('not-an-address')).toThrow(/valid wallet address/);
  });

  it('enforces the Policy Registry 64-member creation limit after deduplication', () => {
    const addresses = Array.from(
      { length: 65 },
      (_, index) => `0x${(index + 1).toString(16).padStart(40, '0')}`,
    );
    expect(normalizePolicyMembers(addresses.slice(0, 64).join('\n'))).toHaveLength(64);
    expect(() => normalizePolicyMembers(addresses.join('\n'))).toThrow(/at most 64/);
  });

  it('uses the base-std simple policy enum values', () => {
    expect(policyKindValue('blocklist')).toBe(0);
    expect(policyKindValue('allowlist')).toBe(1);
    expect(policyKindValue('union')).toBe(2);
    expect(policyKindValue('intersect')).toBe(3);
  });

  it('validates composite children and evaluates UNION/INTERSECT semantics', () => {
    const allow = (1n << 56n) | 42n;
    const block = 43n;
    expect(normalizeCompositeChildIds([allow.toString(), block.toString()])).toEqual([allow, block]);
    expect(policyKindFromId(allow)).toBe('allowlist');
    expect(policyKindFromId(block)).toBe('blocklist');
    expect(evaluateComposite('union', [false, true])).toBe(true);
    expect(evaluateComposite('intersect', [true, false])).toBe(false);
    expect(() => normalizeCompositeChildIds([allow.toString()])).toThrow(/between 2 and 4/);
    expect(() => normalizeCompositeChildIds([allow.toString(), allow.toString()])).toThrow(/only once/);
    expect(() => normalizeCompositeChildIds(['0', block.toString()])).toThrow(/positive|Built-in/);
    expect(() => normalizeCompositeChildIds([((2n << 56n) | 4n).toString(), block.toString()])).toThrow(/cannot contain/);
  });

  it('decodes composite PolicyCreated events', () => {
    const id = (3n << 56n) | 55n;
    const creator = '0x1111111111111111111111111111111111111111' as const;
    const topics = encodeEventTopics({ abi: policyRegistryAbi, eventName: 'PolicyCreated', args: { policyId: id, creator } });
    const log = { address: POLICY_REGISTRY, data: encodeAbiParameters([{ type: 'uint8' }], [3]), topics } as Log;
    expect(readCreatedPolicy([log])).toEqual({ id, creator: getAddress(creator), kind: 'intersect' });
  });

  it('decodes uint64 policy IDs from PolicyCreated logs without number precision loss', () => {
    const id = (1n << 56n) | 42n;
    const creator = '0x1111111111111111111111111111111111111111' as const;
    const topics = encodeEventTopics({
      abi: policyRegistryAbi,
      eventName: 'PolicyCreated',
      args: { policyId: id, creator },
    });
    const log = {
      address: POLICY_REGISTRY,
      data: encodeAbiParameters([{ type: 'uint8' }], [1]),
      topics,
    } as Log;
    expect(readCreatedPolicy([log])).toEqual({ id, creator: getAddress(creator), kind: 'allowlist' });
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
    expect(featureId('policy_registry')).toBe(keccak256(stringToHex('base.policy_registry')));
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
