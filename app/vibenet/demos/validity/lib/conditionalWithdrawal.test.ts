import { decodeFunctionData, keccak256, toBytes } from 'viem';
import { describe, expect, it } from 'vitest';

import artifact from './artifacts/ConditionalWithdrawal.json';
import {
  CONDITIONAL_WITHDRAWAL_AMOUNT,
  CONDITIONAL_WITHDRAWAL_ENABLED_MASK,
  CONDITIONAL_WITHDRAWAL_ENABLED_SLOT,
  CONDITIONAL_WITHDRAWAL_FUNDING_TARGET,
  CONDITIONAL_WITHDRAWAL_REFILL_THRESHOLD,
  CONDITIONAL_WITHDRAWAL_SALT,
  conditionalWithdrawalAbi,
  conditionalWithdrawalEnabledPredicate,
  conditionalWithdrawalFundingAmount,
  encodeConditionalWithdrawalFunding,
  encodeConditionalWithdraw,
  encodeFlipConditionalWithdrawal,
  encodeSetConditionalWithdrawalEnabled,
  predictConditionalWithdrawal,
} from './conditionalWithdrawal';
import { minterAbi, WAD } from './constants';
import { toWord } from './predicates';

const VIBE = '0x1111111111111111111111111111111111111111';
const OTHER_VIBE = '0x2222222222222222222222222222222222222222';
const MINTER = '0x3333333333333333333333333333333333333333';
const WITHDRAWAL = '0x4444444444444444444444444444444444444444';

describe('conditional withdrawal contract', () => {
  it('commits reproducible compiler metadata and nonempty creation bytecode', () => {
    expect(artifact.compiler.version).toBe('0.8.24+commit.e11b9ed9');
    expect(artifact.settings.optimizer).toEqual({ enabled: true, runs: 200 });
    expect(artifact.command).toContain('solc@0.8.24 --optimize --optimize-runs 200');
    expect(artifact.bytecode).toMatch(/^0x[0-9a-f]+$/);
    expect(artifact.bytecode.length).toBeGreaterThan(100);
  });

  it('pins the CREATE2 salt and address for a given shared VIBE token', () => {
    expect(CONDITIONAL_WITHDRAWAL_SALT).toBe(
      '0x75dea569b8cc7d9ea45d7d95a5d6bed33e1e378a31715724342462f8226adc8b',
    );
    expect(predictConditionalWithdrawal(VIBE)).toBe('0x7AE1BFB6116D154a0a27961a5d19C544D02015a9');
    expect(predictConditionalWithdrawal(OTHER_VIBE)).not.toBe(predictConditionalWithdrawal(VIBE));
  });

  it('pins the stable storage word and exact enabled=true EIP-8130 predicate', () => {
    expect(CONDITIONAL_WITHDRAWAL_ENABLED_SLOT).toBe(
      keccak256(toBytes('vibenet.validity.conditional-withdrawal.enabled.v1')),
    );
    expect(CONDITIONAL_WITHDRAWAL_ENABLED_MASK).toBe((1n << 256n) - 1n);
    expect(conditionalWithdrawalEnabledPredicate(WITHDRAWAL)).toEqual({
      type: 'storage',
      params: {
        address: WITHDRAWAL,
        slot: CONDITIONAL_WITHDRAWAL_ENABLED_SLOT,
        mask: toWord((1n << 256n) - 1n),
        op: '=',
        value: toWord(1n),
      },
    });
  });

  it('encodes condition and fixed-withdrawal calls exactly', () => {
    expect(encodeSetConditionalWithdrawalEnabled(WITHDRAWAL, true)).toEqual({
      to: WITHDRAWAL,
      data: `0x328d8f72${'0'.repeat(63)}1`,
    });
    expect(encodeSetConditionalWithdrawalEnabled(WITHDRAWAL, false).data).toBe(
      `0x328d8f72${'0'.repeat(64)}`,
    );
    expect(encodeFlipConditionalWithdrawal(WITHDRAWAL)).toEqual({
      to: WITHDRAWAL,
      data: '0xcde4efa9',
    });
    expect(encodeConditionalWithdraw(WITHDRAWAL)).toEqual({
      to: WITHDRAWAL,
      data: '0x3ccfd60b',
    });
    expect(CONDITIONAL_WITHDRAWAL_AMOUNT).toBe(WAD);
    expect(
      decodeFunctionData({ abi: conditionalWithdrawalAbi, data: encodeConditionalWithdraw(WITHDRAWAL).data })
        .functionName,
    ).toBe('withdraw');
  });
});

describe('conditional withdrawal funding', () => {
  it('refills to two million VIBE only below the one million threshold', () => {
    expect(CONDITIONAL_WITHDRAWAL_REFILL_THRESHOLD).toBe(1_000_000n * WAD);
    expect(CONDITIONAL_WITHDRAWAL_FUNDING_TARGET).toBe(2_000_000n * WAD);
    expect(conditionalWithdrawalFundingAmount(0n)).toBe(2_000_000n * WAD);
    expect(conditionalWithdrawalFundingAmount(1_000_000n * WAD - 1n)).toBe(1_000_000n * WAD + 1n);
    expect(conditionalWithdrawalFundingAmount(1_000_000n * WAD)).toBe(0n);
    expect(conditionalWithdrawalFundingAmount(2_000_000n * WAD)).toBe(0n);
    expect(() => conditionalWithdrawalFundingAmount(-1n)).toThrow(/cannot be negative/);
  });

  it('targets the existing open minter and mints directly to the singleton', () => {
    const call = encodeConditionalWithdrawalFunding({
      minter: MINTER,
      vibe: VIBE,
      withdrawal: WITHDRAWAL,
      balance: 0n,
    });
    expect(call?.to).toBe(MINTER);
    expect(call).not.toBeNull();
    const decoded = decodeFunctionData({ abi: minterAbi, data: call!.data });
    expect(decoded.functionName).toBe('mint');
    expect(decoded.args).toEqual([VIBE, WITHDRAWAL, CONDITIONAL_WITHDRAWAL_FUNDING_TARGET]);
    expect(
      encodeConditionalWithdrawalFunding({
        minter: MINTER,
        vibe: VIBE,
        withdrawal: WITHDRAWAL,
        balance: CONDITIONAL_WITHDRAWAL_REFILL_THRESHOLD,
      }),
    ).toBeNull();
  });
});
