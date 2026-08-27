import { describe, expect, it } from 'vitest';

import { DEMOS, demoLabel } from './catalogue';

describe('demoLabel', () => {
  it('prefers shortTitle for the validity demo', () => {
    expect(demoLabel('validity')).toBe('Validity');
  });

  it('prefers shortTitle over title when both are set', () => {
    const account = DEMOS.find((d) => d.href === '/vibenet/demos/account');
    expect(account?.title).toBe('Accounts');
    expect(demoLabel('account')).toBe(account?.shortTitle);
  });

  it('title-cases a multi-word slug that has no catalogue entry', () => {
    // The regression this guards: the previous implementation only uppercased
    // the first character, rendering "smart-wallet" as "Smart-wallet".
    expect(demoLabel('smart-wallet')).toBe('Smart Wallet');
    expect(demoLabel('paymaster-v2')).toBe('Paymaster V2');
  });

  it('handles a single-word unknown slug', () => {
    expect(demoLabel('bridge')).toBe('Bridge');
  });

  it('does not emit stray spaces for awkward slugs', () => {
    expect(demoLabel('a--b')).toBe('A B');
    expect(demoLabel('-lead')).toBe('Lead');
  });
});

describe('DEMOS', () => {
  it('gives every entry a /vibenet/demos/ href, so demoLabel can resolve it', () => {
    for (const demo of DEMOS) {
      expect(demo.href.startsWith('/vibenet/demos/')).toBe(true);
    }
  });

  it('has no duplicate hrefs', () => {
    const hrefs = DEMOS.map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
