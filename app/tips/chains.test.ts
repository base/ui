import { afterEach, describe, expect, it } from 'vitest';

import { ALL_TIPS_CHAINS, parseTipsChains, resolveTipsChain } from './chains';
import { enabledTipsChains, isTipsChainEnabled } from './enabledChains';

describe('parseTipsChains', () => {
  it('treats unset and empty as every known chain', () => {
    expect(parseTipsChains(undefined)).toEqual([...ALL_TIPS_CHAINS]);
    expect(parseTipsChains(null)).toEqual([...ALL_TIPS_CHAINS]);
    expect(parseTipsChains('')).toEqual([...ALL_TIPS_CHAINS]);
  });

  it('parses an allowlist, tolerating whitespace and case', () => {
    expect(parseTipsChains('mainnet,sepolia')).toEqual(['mainnet', 'sepolia']);
    expect(parseTipsChains(' MAINNET , Sepolia ')).toEqual(['mainnet', 'sepolia']);
  });

  it('keeps catalogue order and drops duplicates', () => {
    expect(parseTipsChains('zeronet,mainnet,mainnet')).toEqual(['mainnet', 'zeronet']);
  });

  it('drops unknown names but keeps the recognized ones', () => {
    expect(parseTipsChains('mainnet,nope')).toEqual(['mainnet']);
  });

  it('falls back to every chain when nothing recognizable is named', () => {
    // A typo should not empty the section; unset semantics are the safer default.
    expect(parseTipsChains('nope,alsonope')).toEqual([...ALL_TIPS_CHAINS]);
  });
});

describe('resolveTipsChain', () => {
  it('defaults to mainnet for missing or unknown values', () => {
    expect(resolveTipsChain(null)).toBe('mainnet');
    expect(resolveTipsChain('nope')).toBe('mainnet');
  });

  it('returns the requested chain when it is enabled', () => {
    expect(resolveTipsChain('zeronet')).toBe('zeronet');
    expect(resolveTipsChain('sepolia', ['mainnet', 'sepolia'])).toBe('sepolia');
  });

  it('falls back to the default when the requested chain is not served here', () => {
    // The production case: a zeronet link opened against the prod deployment.
    expect(resolveTipsChain('zeronet', ['mainnet', 'sepolia'])).toBe('mainnet');
  });

  it('falls back to the first enabled chain when the default is not served', () => {
    expect(resolveTipsChain('mainnet', ['sepolia'])).toBe('sepolia');
    expect(resolveTipsChain('zeronet', ['sepolia', 'zeronet'])).toBe('zeronet');
  });
});

describe('enabledTipsChains', () => {
  const original = process.env.TIPS_CHAINS;
  afterEach(() => {
    if (original === undefined) delete process.env.TIPS_CHAINS;
    else process.env.TIPS_CHAINS = original;
  });

  it('serves every chain when TIPS_CHAINS is unset (local dev)', () => {
    delete process.env.TIPS_CHAINS;
    expect(enabledTipsChains()).toEqual([...ALL_TIPS_CHAINS]);
    expect(isTipsChainEnabled('zeronet')).toBe(true);
  });

  it('honours the production allowlist', () => {
    process.env.TIPS_CHAINS = 'mainnet,sepolia';
    expect(enabledTipsChains()).toEqual(['mainnet', 'sepolia']);
    expect(isTipsChainEnabled('mainnet')).toBe(true);
    expect(isTipsChainEnabled('sepolia')).toBe(true);
    expect(isTipsChainEnabled('zeronet')).toBe(false);
  });

  it('honours the development allowlist', () => {
    process.env.TIPS_CHAINS = 'mainnet,sepolia,zeronet';
    expect(enabledTipsChains()).toEqual(['mainnet', 'sepolia', 'zeronet']);
    expect(isTipsChainEnabled('zeronet')).toBe(true);
  });

  it('is read per call, not cached at module load', () => {
    process.env.TIPS_CHAINS = 'mainnet';
    expect(enabledTipsChains()).toEqual(['mainnet']);
    process.env.TIPS_CHAINS = 'mainnet,zeronet';
    expect(enabledTipsChains()).toEqual(['mainnet', 'zeronet']);
  });
});
