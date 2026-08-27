import { describe, expect, it } from 'vitest';

import {
  chunkDeploymentOperations,
  describeStablecoinOperations,
  type DeploymentOperation,
} from './deployment';

const data = '0x1234' as const;

describe('B20 deployment progress', () => {
  it('keeps configuration batches at six calls', () => {
    const operations: DeploymentOperation[] = Array.from({ length: 8 }, (_, index) => ({
      data,
      kind: 'role' as const,
      role: `ROLE_${index + 1}`,
    }));

    const chunks = chunkDeploymentOperations(operations);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(6);
    expect(chunks[1]).toHaveLength(2);
    expect(chunks.flat()).toEqual(operations);
  });

  it('describes the exact Stablecoin operations in a batch', () => {
    const operations: DeploymentOperation[] = [
      { data, kind: 'role', role: 'MINT_ROLE' },
      { data, kind: 'role', role: 'METADATA_ROLE' },
      { data, kind: 'cap', amount: '10,000,000', symbol: 'USDC' },
      { data, kind: 'metadata' },
      { data, kind: 'mint', amount: '100', symbol: 'USDC', memo: 'Initial deposit' },
      { data, kind: 'policy', id: 42n, scope: 'TRANSFER_RECEIVER_POLICY' },
    ];

    expect(describeStablecoinOperations(operations)).toBe(
      'Grant MINT_ROLE, METADATA_ROLE to the EIP-8130 account; set the supply cap to 10,000,000 USDC; save the token information link; mint 100 USDC to the EIP-8130 account with the “Initial deposit” memo; attach policy 42 to TRANSFER_RECEIVER_POLICY.',
    );
  });
});
