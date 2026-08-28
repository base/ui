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
    });
  });

  it('drops v1 Validity-specific keys', () => {
    const parsed = parseStored(
      JSON.stringify({
        v: 1,
        chainId: 1,
        genesisHash: '0x1',
        userKey: `0x${'11'.repeat(32)}`,
        botKeys: [`0x${'22'.repeat(32)}`, `0x${'33'.repeat(32)}`],
      }),
    );
    expect(parsed).toEqual({ v: 2, chainId: 1, genesisHash: '0x1' });
    expect(parsed && 'userKey' in parsed).toBe(false);
  });
});
