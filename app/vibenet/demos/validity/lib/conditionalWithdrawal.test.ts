import { decodeFunctionData } from 'viem';
import { describe, expect, it, vi } from 'vitest';

import artifact from './artifacts/ConditionalWithdrawal.json';
import {
  CONDITIONAL_WITHDRAWAL_AMOUNT,
  CONDITIONAL_WITHDRAWAL_ENABLED_MASK,
  CONDITIONAL_WITHDRAWAL_ENABLED_SLOT,
  CONDITIONAL_WITHDRAWAL_SALT,
  conditionalWithdrawalAbi,
  conditionalWithdrawalEnabledPredicate,
  encodeConditionalWithdraw,
  predictConditionalWithdrawal,
  probeConditionalWithdrawal,
} from './conditionalWithdrawal';
import { WAD } from './constants';
import { toWord } from './predicates';

const VIBE = '0x1111111111111111111111111111111111111111';
const OTHER_VIBE = '0x2222222222222222222222222222222222222222';
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
    expect(predictConditionalWithdrawal(VIBE)).toBe('0xC655E339224d57B087A02Df7827A4068ae69aba1');
    expect(predictConditionalWithdrawal(OTHER_VIBE)).not.toBe(predictConditionalWithdrawal(VIBE));
  });

  it('discovers only an existing singleton configured for the shared VIBE token', async () => {
    const client = {
      getCode: vi.fn().mockResolvedValue('0x1234'),
      readContract: vi.fn().mockResolvedValue(VIBE),
    };

    await expect(probeConditionalWithdrawal(client as never, VIBE)).resolves.toBe(
      predictConditionalWithdrawal(VIBE),
    );
    expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: predictConditionalWithdrawal(VIBE),
      functionName: 'VIBE',
    }));

    client.readContract.mockResolvedValueOnce(OTHER_VIBE);
    await expect(probeConditionalWithdrawal(client as never, VIBE)).resolves.toBeNull();
  });

  it('reads bool public enabled from slot 0 in the EIP-8130 predicate', () => {
    expect(CONDITIONAL_WITHDRAWAL_ENABLED_SLOT).toBe(0n);
    expect(CONDITIONAL_WITHDRAWAL_ENABLED_MASK).toBe(0xffn);
    expect(conditionalWithdrawalEnabledPredicate(WITHDRAWAL)).toEqual({
      type: 'storage',
      params: {
        address: WITHDRAWAL,
        slot: toWord(0n),
        mask: toWord(0xffn),
        op: '=',
        value: toWord(1n),
      },
    });
  });

  it('encodes the fixed withdrawal call exactly', () => {
    const functionNames = artifact.abi
      .filter((item) => item.type === 'function')
      .map((item) => item.name);
    expect(functionNames).not.toContain('ENABLED_SLOT');
    expect(functionNames).not.toContain('flip');
    expect(functionNames).toContain('enabled');
    expect(functionNames).toContain('setEnabled');
    expect(functionNames).toContain('withdraw');
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
