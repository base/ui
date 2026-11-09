import { describe, expect, it } from 'vitest';

import { pickShareVariant, SHARE_URL, shareText, xShareUrl } from './share';

describe('shareText', () => {
  it('writes the "ate" line', () => {
    expect(shareText(42, 'ate')).toBe(
      'I ate 42 blocks on Base Runner\n\nHow long can you survive? https://chain.base.org/vibenet/demos/200',
    );
  });

  it('writes the "survived" line', () => {
    expect(shareText(7, 'survived')).toBe(
      'I survived 7 blocks on Base Runner\n\nSee how long you can last: https://chain.base.org/vibenet/demos/200',
    );
  });
});

describe('xShareUrl', () => {
  it('builds an X post intent that round-trips the text', () => {
    const text = shareText(42, 'ate');
    const url = new URL(xShareUrl(text));
    expect(url.origin + url.pathname).toBe('https://x.com/intent/post');
    expect(url.searchParams.get('text')).toBe(text);
    expect(url.searchParams.get('text')).toContain(SHARE_URL);
  });
});

describe('pickShareVariant', () => {
  it('maps the random range onto both variants', () => {
    expect(pickShareVariant(() => 0)).toBe('ate');
    expect(pickShareVariant(() => 0.49)).toBe('ate');
    expect(pickShareVariant(() => 0.5)).toBe('survived');
    expect(pickShareVariant(() => 0.999)).toBe('survived');
  });
});
