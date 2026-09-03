import { describe, expect, it } from 'vitest';

import sitemap from './sitemap';

describe('sitemap', () => {
  it('indexes the Validity Transactions group and both nested demos', () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain('https://chain.base.org/vibenet/demos/validity');
    expect(urls).toContain('https://chain.base.org/vibenet/demos/validity/conditional-swaps');
    expect(urls).toContain('https://chain.base.org/vibenet/demos/validity/race-the-agent');
  });
});
