import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it, vi } from 'vitest';

import { signK1Eip1559Call } from './eip1559';

const TO = '0x1111111111111111111111111111111111111111' as const;

describe('signK1Eip1559Call', () => {
  it('prepares and signs a type-2 call with the K1 owner', async () => {
    const privateKey = generatePrivateKey();
    const signer = {
      id: 'k1',
      kind: 'k1' as const,
      label: 'K1',
      actorId: '0x01' as const,
      authenticator: TO,
      privateKey,
      address: privateKeyToAccount(privateKey).address,
    };
    const client = {
      getTransactionCount: vi.fn().mockResolvedValue(7),
      estimateFeesPerGas: vi.fn().mockResolvedValue({
        maxFeePerGas: 2_000_000_000n,
        maxPriorityFeePerGas: 1_000_000n,
      }),
    };

    const serialized = await signK1Eip1559Call({
      client: client as never,
      signer,
      call: { to: TO, data: '0x1234' },
      gas: 100_000n,
    });

    expect(serialized.startsWith('0x02')).toBe(true);
    expect(client.getTransactionCount).toHaveBeenCalledWith({
      address: signer.address,
      blockTag: 'latest',
    });
    expect(client.estimateFeesPerGas).toHaveBeenCalledOnce();
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
