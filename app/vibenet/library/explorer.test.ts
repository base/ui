import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeFunctionData, padHex, stringToHex } from 'viem';

import {
  B20_ANNOUNCEMENT_TOPIC,
  B20_END_ANNOUNCEMENT_TOPIC,
  B20_UI_MULTIPLIER_UPDATED_TOPIC,
  EXECUTE_BATCH_SELECTOR,
  decodeB20Event,
  decodeB20MemoCalldata,
  decodeB20MemoEvent,
  decodeExecuteBatch,
  fmtHexInt,
  fmtTokenAmount,
  hexToInt,
  scopeChips,
  scopeLabel,
  txTypeLabel,
  weiToEth,
} from './explorer';

// Function fragments used to build faithful calldata for the decoders under
// test — encoding with viem guarantees the fixtures match on-chain layout.
const memoAbi = [
  { type: 'function', name: 'transferWithMemo', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'transferFromWithMemo', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'mintWithMemo', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'burnWithMemo', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'bytes32' }], outputs: [] },
] as const;
const batchAbi = [
  { type: 'function', name: 'executeBatch', stateMutability: 'nonpayable', inputs: [{ type: 'tuple[]', components: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }] }], outputs: [] },
] as const;

const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';
const memoHex = padHex(stringToHex('refund #7'), { dir: 'right', size: 32 });

describe('B20 memo calldata decoding', () => {
  it('decodes a transferWithMemo transaction', () => {
    const data =
      '0x95777d590000000000000000000000006a57f465e89192c776738873d62da0598134165a00000000000000000000000000000000000000000000000000038d7ea4c6800073656e64696e6720746573740000000000000000000000000000000000000000';

    expect(decodeB20MemoCalldata(data)).toEqual({
      operation: 'transferWithMemo',
      recipient: '0x6a57f465e89192c776738873d62da0598134165a',
      rawAmount: 1_000_000_000_000_000n,
      memo: '0x73656e64696e6720746573740000000000000000000000000000000000000000',
      memoText: 'sending test',
    });
  });

  it('ignores unrelated and truncated calldata', () => {
    expect(decodeB20MemoCalldata('0xa9059cbb')).toBeNull();
    expect(decodeB20MemoCalldata('0x95777d59')).toBeNull();
  });

  it('decodes transferFromWithMemo with both actor addresses', () => {
    const data = encodeFunctionData({ abi: memoAbi, functionName: 'transferFromWithMemo', args: [ADDR_A, ADDR_B, 5n, memoHex] });
    expect(decodeB20MemoCalldata(data)).toEqual({
      operation: 'transferFromWithMemo',
      from: ADDR_A.toLowerCase(),
      recipient: ADDR_B.toLowerCase(),
      rawAmount: 5n,
      memo: memoHex,
      memoText: 'refund #7',
    });
  });

  it('decodes mintWithMemo (recipient, no from)', () => {
    const data = encodeFunctionData({ abi: memoAbi, functionName: 'mintWithMemo', args: [ADDR_B, 42n, memoHex] });
    expect(decodeB20MemoCalldata(data)).toEqual({
      operation: 'mintWithMemo',
      recipient: ADDR_B.toLowerCase(),
      rawAmount: 42n,
      memo: memoHex,
      memoText: 'refund #7',
    });
  });

  it('decodes burnWithMemo (amount + memo only, no addresses)', () => {
    const data = encodeFunctionData({ abi: memoAbi, functionName: 'burnWithMemo', args: [7n, memoHex] });
    expect(decodeB20MemoCalldata(data)).toEqual({
      operation: 'burnWithMemo',
      rawAmount: 7n,
      memo: memoHex,
      memoText: 'refund #7',
    });
  });
});

describe('executeBatch calldata decoding', () => {
  it('decodes the inner (address,uint256,bytes)[] with correct offsets', () => {
    const data = encodeFunctionData({
      abi: batchAbi,
      functionName: 'executeBatch',
      args: [[[ADDR_A, 0n, '0x'], [ADDR_B, 1000n, '0xabcdef']]],
    });
    expect(data.slice(0, 10)).toBe(EXECUTE_BATCH_SELECTOR);
    expect(decodeExecuteBatch(data)).toEqual([
      { to: ADDR_A.toLowerCase(), value: '0x0', data: '0x' },
      { to: ADDR_B.toLowerCase(), value: '0x3e8', data: '0xabcdef' },
    ]);
  });

  it('returns null for non-batch calldata', () => {
    expect(decodeExecuteBatch('0xa9059cbb')).toBeNull();
    expect(decodeExecuteBatch('')).toBeNull();
  });
});

describe('B20 announcement bracket events', () => {
  const base = { address: '0xb2000000000000000000008df7bf791b68b07b92', logIndex: 0, decoded: null };

  it('decodes UIMultiplierUpdated', () => {
    expect(decodeB20Event({
      ...base,
      topics: [B20_UI_MULTIPLIER_UPDATED_TOPIC],
      data: encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
        [1_000_000_000_000_000_000n, 2_000_000_000_000_000_000n, 1_735_689_600n],
      ),
    })).toEqual({
      eventName: 'UIMultiplierUpdated',
      previousMultiplier: 1_000_000_000_000_000_000n,
      newMultiplier: 2_000_000_000_000_000_000n,
      effectiveAt: 1_735_689_600n,
    });
  });

  it('decodes EndAnnouncement', () => {
    expect(decodeB20Event({
      ...base,
      topics: [B20_END_ANNOUNCEMENT_TOPIC],
      data: encodeAbiParameters([{ type: 'string' }], ['demo-split']),
    })).toEqual({ eventName: 'EndAnnouncement', id: 'demo-split' });
  });

  it('returns null for an unrecognized topic', () => {
    expect(decodeB20Event({ ...base, topics: [`0x${'ab'.repeat(32)}`], data: '0x' })).toBeNull();
  });
});

describe('EIP-8130 scope bitmask', () => {
  it('maps the empty scope to full owner control', () => {
    expect(scopeChips(0)).toEqual(['owner (full control)']);
    expect(scopeLabel(0)).toBe('owner (unrestricted)');
  });

  it('decodes individual and combined scope bits', () => {
    expect(scopeChips(1)).toEqual(['signer']);
    expect(scopeChips(3)).toEqual(['signer', 'sender']);
    expect(scopeChips(15)).toEqual(['signer', 'sender', 'payer', 'config']);
    expect(scopeLabel(6)).toBe('sender + payer');
  });

  it('falls back to hex for scopes with no known bits', () => {
    expect(scopeChips(16)).toEqual(['0x10']);
  });
});

describe('explorer number + type formatting', () => {
  it('formats token amounts, trimming fractional zeros', () => {
    expect(fmtTokenAmount(0n, 18)).toBe('0');
    expect(fmtTokenAmount(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    expect(fmtTokenAmount(2_000_000_000_000_000_000_000n, 18)).toBe('2,000');
  });

  it('formats wei and hex quantities with sentinels for missing input', () => {
    expect(weiToEth('0x0')).toBe('0 ETH');
    expect(weiToEth('0xde0b6b3a7640000')).toBe('1 ETH');
    expect(weiToEth(null)).toBe('—');
    expect(fmtHexInt('0x1a')).toBe('26');
    expect(fmtHexInt(null)).toBe('—');
    expect(hexToInt('0xff')).toBe(255);
    expect(hexToInt(null)).toBeNull();
  });

  it('labels transaction types by numeric, name, and hex forms', () => {
    expect(txTypeLabel(2, null)).toEqual({ hex: '0x2', label: 'EIP-1559' });
    expect(txTypeLabel('eip7702', null)).toEqual({ hex: '0x4', label: 'EIP-7702 (Set Code)' });
    expect(txTypeLabel(null, '0x79')).toEqual({ hex: '0x79', label: 'EIP-8130 (Account Abstraction)' });
    expect(txTypeLabel(null, null)).toBeNull();
  });
});

describe('B20 memo event decoding', () => {
  it('decodes a Memo event emitted during factory initialization', () => {
    const caller = '0xb20f000000000000000000000000000000000000';
    const memo = '0x496e697469616c206465706f7369740000000000000000000000000000000000';

    expect(decodeB20MemoEvent({
      address: '0xb20000000000000000000035d1bf517b2b9b514b',
      topics: [
        '0x6989f5818dcfd11f8cd53b27c94cec33dae1589735f03e639cba54553a1825e8',
        `0x${'0'.repeat(24)}${caller.slice(2)}`,
        memo,
      ],
      data: '0x',
      logIndex: 11,
      decoded: null,
    })).toEqual({ caller, memo, memoText: 'Initial deposit' });
  });
});

describe('B20 announcement event decoding', () => {
  it('decodes the announcement published by an Asset token', () => {
    const caller = '0xeaf7bfba683acbd4458d4a157751b9de7ec764f8';
    const event = decodeB20Event({
      address: '0xb2000000000000000000008df7bf791b68b07b92',
      topics: [B20_ANNOUNCEMENT_TOPIC, `0x${'0'.repeat(24)}${caller.slice(2)}`],
      data: encodeAbiParameters(
        [{ type: 'string' }, { type: 'string' }, { type: 'string' }],
        ['demo-split', '2:1 forward split demonstration', 'https://example.com/disclosure'],
      ),
      logIndex: 0,
      decoded: null,
    });

    expect(event).toEqual({
      eventName: 'Announcement',
      caller,
      id: 'demo-split',
      description: '2:1 forward split demonstration',
      uri: 'https://example.com/disclosure',
    });
  });
});
