import { describe, expect, it } from 'vitest';

import sitemap from './sitemap';

describe('sitemap', () => {
  it('indexes the Validity Transactions group and every nested demo', () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain('https://chain.base.org/vibenet/demos/validity');
    expect(urls).toContain('https://chain.base.org/vibenet/demos/validity/conditional-swaps');
    expect(urls).toContain('https://chain.base.org/vibenet/demos/validity/race-the-agent');
    expect(urls).toContain('https://chain.base.org/vibenet/demos/validity/liquidations');
  });
});
