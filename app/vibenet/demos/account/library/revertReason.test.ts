import { encodeErrorResult } from 'viem';
import { describe, expect, it } from 'vitest';

import { revertReason } from './revertReason';

const abi = [
  { type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] },
  {
    type: 'error',
    name: 'ERC20InsufficientBalance',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'balance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InsufficientAllowance',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'allowance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
] as const;

const balanceData = encodeErrorResult({
  abi,
  errorName: 'Error',
  args: ['ERC20: transfer amount exceeds balance'],
});
const customBalance = encodeErrorResult({
  abi,
  errorName: 'ERC20InsufficientBalance',
  args: ['0x0000000000000000000000000000000000000001', 10n, 50n],
});
const customAllowance = encodeErrorResult({
  abi,
  errorName: 'ERC20InsufficientAllowance',
  args: ['0x0000000000000000000000000000000000000001', 0n, 1n],
});

describe('revertReason', () => {
  it('reads an ERC-20 balance revert out of the node message viem hides', () => {
    const err = {
      shortMessage: 'RPC Request failed.',
      details: 'execution reverted: ERC20: transfer amount exceeds balance',
      message: 'RPC Request failed.\n\nDetails: execution reverted: ERC20: transfer amount exceeds balance\nVersion: viem@2.0.0',
    };
    expect(revertReason(err)).toBe('Not enough ERC-20 balance for this transfer.');
  });

  it('decodes Error(string) revert data when the node message has no reason', () => {
    const err = {
      shortMessage: 'RPC Request failed.',
      details: 'execution reverted',
      data: balanceData,
      cause: { code: 3, message: 'execution reverted', data: balanceData },
    };
    expect(revertReason(err)).toBe('Not enough ERC-20 balance for this transfer.');
  });

  it('decodes the ERC-20 custom balance and allowance errors', () => {
    expect(revertReason({ shortMessage: 'RPC Request failed.', details: 'execution reverted', data: customBalance })).toBe(
      'Not enough ERC-20 balance for this transfer.',
    );
    expect(revertReason({ shortMessage: 'RPC Request failed.', data: customAllowance })).toBe(
      'Not enough ERC-20 allowance for this transfer.',
    );
  });

  it('keeps an unrecognized revert string', () => {
    expect(revertReason({ details: 'execution reverted: USDV: transfers are paused' })).toBe(
      'This transaction would revert: USDV: transfers are paused.',
    );
  });

  it('names an ETH balance failure', () => {
    expect(revertReason({ details: 'insufficient funds for gas * price + value' })).toBe(
      'Not enough ETH to cover this transaction.',
    );
  });

  it('reads the vibenet USDV revert, whose reason is the string "balance"', () => {
    const err = {
      shortMessage: 'RPC Request failed.',
      details: 'execution reverted: balance',
      data: '0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000762616c616e636500000000000000000000000000000000000000000000000000',
      cause: { code: 3, message: 'execution reverted: balance' },
    };
    expect(revertReason(err)).toBe('Not enough ERC-20 balance for this transfer.');
  });

  it('falls back when the only text is the RPC wrapper', () => {
    expect(revertReason({ shortMessage: 'RPC Request failed.', message: 'RPC Request failed.' })).toBe(
      'This transaction would revert.',
    );
  });
});
