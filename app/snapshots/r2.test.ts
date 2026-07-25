import { decodeXml } from './r2';

describe('decodeXml', () => {
  it('decodes the XML entities R2 listings use', () => {
    expect(decodeXml('&amp;')).toBe('&');
    expect(decodeXml('&lt;')).toBe('<');
    expect(decodeXml('&gt;')).toBe('>');
    expect(decodeXml('&quot;')).toBe('"');
    expect(decodeXml('&apos;')).toBe("'");
    expect(decodeXml('123/manifest.json')).toBe('123/manifest.json');
  });

  it('decodes each entity exactly once', () => {
    // The regression this guards: chained replacements expand `&amp;` first, so these
    // decode twice and invent markup the document never contained.
    expect(decodeXml('&amp;lt;')).toBe('&lt;');
    expect(decodeXml('&amp;amp;')).toBe('&amp;');
    expect(decodeXml('&amp;quot;x&amp;quot;')).toBe('&quot;x&quot;');
  });

  it('leaves unrecognized entities alone', () => {
    expect(decodeXml('&nbsp;')).toBe('&nbsp;');
    expect(decodeXml('&#60;')).toBe('&#60;');
    expect(decodeXml('a & b')).toBe('a & b');
  });

  it('decodes entities mixed into surrounding text', () => {
    expect(decodeXml('a&amp;b&lt;c&gt;d')).toBe('a&b<c>d');
  });
});
