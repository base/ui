import { afterEach, describe, expect, it, vi } from 'vitest';

import { POLICY_STORAGE_KEY } from './constants';
import { readRecentPolicies, writeRecentPolicy } from './recent';
import type { RecentPolicy } from './types';

function installLocalStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe('recent B20 policies', () => {
  it('round-trips bigint policy IDs as chain-wide browser history', () => {
    const values = installLocalStorage();
    const wallet = '0x1111111111111111111111111111111111111111' as const;
    const otherWallet = '0x2222222222222222222222222222222222222222' as const;
    const policy: RecentPolicy = {
      id: (1n << 56n) | 99n,
      kind: 'allowlist',
      admin: wallet,
      hash: `0x${'ab'.repeat(32)}`,
      memberCount: 2,
    };

    expect(writeRecentPolicy(wallet, policy)).toEqual([policy]);
    expect(readRecentPolicies(wallet)).toEqual([policy]);
    expect(readRecentPolicies(otherWallet)).toEqual([policy]);
    expect(values.get(POLICY_STORAGE_KEY)).toContain(`"id":"${policy.id.toString()}"`);
  });

  it('keeps the newest eight unique policies and ignores corrupt IDs', () => {
    const values = installLocalStorage();
    const wallet = '0x1111111111111111111111111111111111111111' as const;
    for (let index = 0; index < 10; index += 1) {
      writeRecentPolicy(wallet, {
        id: BigInt(index + 2),
        kind: 'blocklist',
        admin: wallet,
        hash: `0x${index.toString(16).padStart(64, '0')}` as `0x${string}`,
        memberCount: 0,
      });
    }
    expect(readRecentPolicies(wallet).map(({ id }) => id)).toEqual([11n, 10n, 9n, 8n, 7n, 6n, 5n, 4n]);

    const raw = JSON.parse(values.get(POLICY_STORAGE_KEY) ?? '{}') as Record<string, unknown[]>;
    const key = Object.keys(raw)[0];
    raw[key].unshift({ id: 'broken' });
    values.set(POLICY_STORAGE_KEY, JSON.stringify(raw));
    expect(readRecentPolicies(wallet)).toHaveLength(8);
  });

  it('persists local labels and bigint child IDs for composite policies', () => {
    const values = installLocalStorage();
    const wallet = '0x1111111111111111111111111111111111111111' as const;
    const policy: RecentPolicy = {
      id: (2n << 56n) | 22n,
      kind: 'union',
      label: 'KYC or partner',
      admin: wallet,
      hash: `0x${'cd'.repeat(32)}`,
      childPolicyIds: [(1n << 56n) | 2n, 8n],
    };
    writeRecentPolicy(wallet, policy);
    expect(readRecentPolicies(wallet)).toEqual([policy]);
    expect(values.get(POLICY_STORAGE_KEY)).toContain('"childPolicyIds":["72057594037927938","8"]');
  });
});
