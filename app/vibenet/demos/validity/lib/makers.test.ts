import { describe, expect, it } from 'vitest';

import type { StoredAccount } from '../../account/library/model';
import { ensureMakers, MAKER_LABELS, rootAccount } from './makers';

function account(partial: Partial<StoredAccount> & Pick<StoredAccount, 'id' | 'label'>): StoredAccount {
  return {
    saltField: '',
    salt: '0x',
    address: '0x0000000000000000000000000000000000000001',
    initialActors: [],
    owners: [],
    deployed: false,
    configSeq: 0,
    sessionKeys: [],
    subAccounts: [],
    createdAt: 0,
    ...partial,
  };
}

describe('rootAccount', () => {
  it('walks up to the parent', () => {
    const root = account({ id: 'root', label: 'Root' });
    const child = account({ id: 'child', label: 'Child', parentId: 'root' });
    expect(rootAccount(child, [root, child]).id).toBe('root');
  });
});

describe('ensureMakers', () => {
  it('reuses stored ids and creates the rest', () => {
    const parent = account({ id: 'p', label: 'Parent' });
    const existing = account({ id: 'm1', label: MAKER_LABELS[0], parentId: 'p' });
    const created: string[] = [];
    const [a, b] = ensureMakers(parent, [parent, existing], ['m1', 'missing'], (label) => {
      created.push(label);
      return { account: account({ id: 'm2', label, parentId: 'p' }) };
    });
    expect(a.id).toBe('m1');
    expect(b.id).toBe('m2');
    expect(created).toEqual([MAKER_LABELS[1]]);
  });
});
