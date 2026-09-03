import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasCode: vi.fn(),
}));

vi.mock('./singleton', () => ({
  CREATE2_DEPLOYER: '0x3333333333333333333333333333333333333333',
  create2Address: () => '0x2222222222222222222222222222222222222222',
  hasCode: mocks.hasCode,
  singletonSalt: () => `0x${'11'.repeat(32)}`,
}));

import { ensureConditionalWithdrawal } from './conditionalWithdrawal';

const VIBE = '0x1111111111111111111111111111111111111111';
const WITHDRAWAL = '0x2222222222222222222222222222222222222222';

describe('ensureConditionalWithdrawal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a correctly configured deployment created concurrently by another visitor', async () => {
    mocks.hasCode.mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    const publicClient = {
      readContract: vi.fn().mockResolvedValue(VIBE),
    };
    const wallet = {
      chain: {},
      sendTransaction: vi.fn().mockRejectedValue(new Error('CREATE2 duplicate')),
    };

    await expect(ensureConditionalWithdrawal({
      wallet: wallet as never,
      publicClient: publicClient as never,
      account: {} as never,
      vibe: VIBE,
    })).resolves.toBe(WITHDRAWAL);
    expect(publicClient.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: WITHDRAWAL,
      functionName: 'VIBE',
    }));
    expect(wallet.sendTransaction).toHaveBeenCalled();
  });
});
