import { describe, expect, it } from 'vitest';

import { parseStored } from './store';

describe('parseStored', () => {
  it('reads v2 deployment-only state', () => {
    const parsed = parseStored(
      JSON.stringify({
        v: 2,
        chainId: 84538453,
        genesisHash: '0xabc',
        accountId: 'acct-1',
        makerAccountIds: ['m1', 'm2'],
      }),
    );
    expect(parsed).toEqual({
      v: 2,
      chainId: 84538453,
      genesisHash: '0xabc',
      accountId: 'acct-1',
      makerAccountIds: ['m1', 'm2'],
      deployment: undefined,
      orders: undefined,
    });
  });

  it('round-trips submitted orders with bigint fields', () => {
    const parsed = parseStored(
      JSON.stringify({
        v: 2,
        chainId: 84538453,
        genesisHash: '0xabc',
        orders: [
          {
            id: 'ord-1',
            side: 'buy',
            targetPriceWad: { $bn: '70000000000000000' },
            size: { $bn: '100000000000000000000' },
            expirySeconds: 15,
            submittedAt: 1_700_000_000_000,
            status: 'pending',
            rectangle: {
              r0Min: { $bn: '1' },
              r0Max: { $bn: '2' },
              r1Min: { $bn: '3' },
              r1Max: { $bn: '4' },
              side: 'buy',
            },
            validity: [],
            txHash: `0x${'ab'.repeat(32)}`,
          },
          { id: 'bad' },
        ],
      }),
    );
    expect(parsed?.orders).toHaveLength(1);
    expect(parsed?.orders?.[0]?.targetPriceWad).toBe(70000000000000000n);
    expect(parsed?.orders?.[0]?.size).toBe(100000000000000000000n);
    expect(parsed?.orders?.[0]?.txHash).toMatch(/^0xab/);
  });
});
