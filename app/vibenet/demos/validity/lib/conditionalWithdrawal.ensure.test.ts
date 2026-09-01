import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureCreate2Contract: vi.fn(),
  ensureCreate2Deployer: vi.fn(),
  hasCode: vi.fn(),
}));

vi.mock('./singleton', () => ({
  create2Address: () => '0x2222222222222222222222222222222222222222',
  ensureCreate2Contract: mocks.ensureCreate2Contract,
  ensureCreate2Deployer: mocks.ensureCreate2Deployer,
  hasCode: mocks.hasCode,
  singletonSalt: () => `0x${'11'.repeat(32)}`,
}));

import { ensureConditionalWithdrawal } from './conditionalWithdrawal';

const VIBE = '0x1111111111111111111111111111111111111111';
const WITHDRAWAL = '0x2222222222222222222222222222222222222222';

describe('ensureConditionalWithdrawal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureCreate2Deployer.mockResolvedValue(undefined);
  });

  it('accepts a correctly configured deployment created concurrently by another visitor', async () => {
    mocks.hasCode.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.ensureCreate2Contract.mockRejectedValue(new Error('CREATE2 duplicate'));
    const publicClient = {
      readContract: vi.fn().mockResolvedValue(VIBE),
    };

    await expect(ensureConditionalWithdrawal({
      wallet: {} as never,
      publicClient: publicClient as never,
      account: {} as never,
      vibe: VIBE,
    })).resolves.toBe(WITHDRAWAL);
    expect(publicClient.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: WITHDRAWAL,
      functionName: 'VIBE',
    }));
  });
});
