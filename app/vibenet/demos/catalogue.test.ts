import { describe, expect, it } from 'vitest';

import { DEMOS, demoBreadcrumb, demoForPath, demoLabel, listedDemos } from './catalogue';

describe('demoLabel', () => {
  it('uses the group title for the validity demo', () => {
    expect(demoLabel('validity')).toBe('Validity Transactions');
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
  const allDemos = DEMOS.flatMap((demo) => [demo, ...(demo.children ?? [])]);

  it('gives every entry a /vibenet/demos/ href, so demoLabel can resolve it', () => {
    for (const demo of allDemos) {
      expect(demo.href.startsWith('/vibenet/demos/')).toBe(true);
    }
  });

  it('has no duplicate hrefs', () => {
    const hrefs = allDemos.map((demo) => demo.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('lists Validity Transactions as a top-level group', () => {
    const validity = listedDemos().find((demo) => demo.href === '/vibenet/demos/validity');
    expect(validity?.title).toBe('Validity Transactions');
    expect(validity?.children?.map((demo) => demo.title)).toEqual(['Conditional Swaps']);
  });
});

describe('demoForPath', () => {
  it('finds nested demos without flattening them onto the Vibenet grid', () => {
    expect(demoForPath('/vibenet/demos/validity/conditional-swaps')?.title).toBe('Conditional Swaps');
    expect(listedDemos().some((demo) => demo.title === 'Conditional Swaps')).toBe(false);
  });
});

describe('demoBreadcrumb', () => {
  it('resolves a top-level group breadcrumb', () => {
    expect(demoBreadcrumb('/vibenet/demos/validity')).toEqual({
      childLabel: 'Validity Transactions',
    });
  });

  it('resolves a nested demo breadcrumb through its group', () => {
    expect(demoBreadcrumb('/vibenet/demos/validity/conditional-swaps')).toEqual({
      middle: {
        label: 'Validity Transactions',
        href: '/vibenet/demos/validity',
      },
      childLabel: 'Conditional Swaps',
    });
  });

  it('falls back to readable labels for unregistered nested routes', () => {
    expect(demoBreadcrumb('/vibenet/demos/trading/stop-loss')).toEqual({
      middle: { label: 'Trading', href: '/vibenet/demos/trading' },
      childLabel: 'Stop Loss',
    });
  });
});
