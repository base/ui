import { describe, expect, it } from 'vitest';

import { normalizePersistedState } from './model';

const KEY = `0x${'11'.repeat(32)}`;
const ADDRESS = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';

describe('normalizePersistedState', () => {
  it('keeps EOA accounts backed by a stored K1 key', () => {
    const state = normalizePersistedState({
      signers: [
        { id: 's1', kind: 'k1', label: 'K1 1', privateKey: KEY, address: ADDRESS, actorId: '0x01', authenticator: '0x01' },
      ],
      accounts: [
        {
          id: 'a1',
          label: 'Default',
          type: 'eoa',
          address: ADDRESS.toLowerCase(),
          owners: [{ signerId: 's1' }],
          sessionKeys: [],
          subAccounts: [],
          createdAt: 5,
        },
      ],
      activeAccountId: 'a1',
      activity: [
        { id: 'e1', ts: 1, kind: 'session', title: 'Session key staged' },
        { id: 'e2', ts: 2, kind: 'delegate', title: 'Code delegation set' },
      ],
    });
    expect(state.signers).toEqual([{ id: 's1', kind: 'k1', label: 'K1 1', privateKey: KEY, address: ADDRESS }]);
    expect(state.accounts).toEqual([
      { id: 'a1', label: 'Default', type: 'eoa', signerId: 's1', address: ADDRESS, createdAt: 5 },
    ]);
    expect(state.activeAccountId).toBe('a1');
    expect(state.activity.map((e) => e.kind)).toEqual(['transact', 'transact']);
  });

  it('drops smart accounts, sub-accounts, and non-K1 keys without throwing', () => {
    const state = normalizePersistedState({
      signers: [
        { id: 's1', kind: 'k1', label: 'K1 1', privateKey: KEY, address: ADDRESS },
        { id: 's2', kind: 'passkey', label: 'Passkey 1', credential: { id: 'c', publicKey: '0x' } },
      ],
      accounts: [
        { id: 'smart', type: 'smart', address: '0x0000000000000000000000000000000000000abc' },
        { id: 'legacy', address: '0x0000000000000000000000000000000000000def' },
        { id: 'sub', type: 'eoa', parentId: 'smart', address: ADDRESS },
      ],
      activeAccountId: 'smart',
    });
    expect(state.signers.map((s) => s.id)).toEqual(['s1']);
    expect(state.accounts).toEqual([]);
    expect(state.activeAccountId).toBeNull();
  });

  it('tolerates garbage', () => {
    expect(normalizePersistedState(null)).toEqual({ signers: [], accounts: [], activeAccountId: null, activity: [] });
    expect(normalizePersistedState({ signers: 'x', accounts: [1, null] }).accounts).toEqual([]);
  });
});
