import { parseTransaction } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it, vi } from 'vitest';

import { signK1Eip1559Call } from './eip1559';

const TO = '0x1111111111111111111111111111111111111111' as const;
const PRIVATE_KEY = generatePrivateKey();
const SIGNER = {
  id: 'k1',
  kind: 'k1' as const,
  label: 'K1',
  actorId: '0x01' as const,
  authenticator: TO,
  privateKey: PRIVATE_KEY,
  address: privateKeyToAccount(PRIVATE_KEY).address,
};

describe('signK1Eip1559Call', () => {
  it('prepares and signs a type-2 call with the K1 owner', async () => {
    const client = {
      getTransactionCount: vi.fn().mockResolvedValue(7),
      estimateFeesPerGas: vi.fn().mockResolvedValue({
        maxFeePerGas: 2_000_000_000n,
        maxPriorityFeePerGas: 1_000_000n,
      }),
    };

    const serialized = await signK1Eip1559Call({
      client: client as never,
      signer: SIGNER,
      call: { to: TO, data: '0x1234' },
      gas: 100_000n,
    });

    expect(serialized.startsWith('0x02')).toBe(true);
    expect(client.getTransactionCount).toHaveBeenCalledWith({
      address: SIGNER.address,
      blockTag: 'latest',
    });
    expect(client.estimateFeesPerGas).toHaveBeenCalledOnce();
  });

  it('uses caller-provided nonce and replacement fees without estimating', async () => {
    const client = {
      getTransactionCount: vi.fn(),
      estimateFeesPerGas: vi.fn(),
    };
    const serialized = await signK1Eip1559Call({
      client: client as never,
      signer: SIGNER,
      call: { to: TO, data: '0x1234' },
      gas: 250_000n,
      nonce: 9,
      fees: { maxFeePerGas: 3_000_000_000n, maxPriorityFeePerGas: 2_000_000n },
    });

    expect(parseTransaction(serialized)).toMatchObject({
      type: 'eip1559',
      nonce: 9,
      maxFeePerGas: 3_000_000_000n,
      maxPriorityFeePerGas: 2_000_000n,
    });
    expect(client.getTransactionCount).not.toHaveBeenCalled();
    expect(client.estimateFeesPerGas).not.toHaveBeenCalled();
  });

  it('requires a K1 signer', async () => {
    await expect(signK1Eip1559Call({
      client: {} as never,
      signer: null,
      call: { to: TO, data: '0x' },
      gas: 100_000n,
    })).rejects.toThrow('A K1 owner is required');
  });
});
