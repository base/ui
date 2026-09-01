import { describe, expect, it } from 'vitest';

import { predictSingleton, SINGLETON_SALTS, singletonSalt } from './singleton';

describe('predictSingleton', () => {
  it('is stable across calls and distinct per contract', () => {
    const first = predictSingleton();
    expect(predictSingleton()).toEqual(first);
    const addrs = [first.minter, first.tokenB, first.factory, first.helper];
    expect(new Set(addrs.map((addr) => addr.toLowerCase())).size).toBe(4);
    for (const addr of addrs) {
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
});

describe('singletonSalt', () => {
  it('keeps one salt per label', () => {
    expect(singletonSalt('vibe')).toBe(SINGLETON_SALTS.vibe);
    expect(new Set(Object.values(SINGLETON_SALTS)).size).toBe(5);
  });
});
