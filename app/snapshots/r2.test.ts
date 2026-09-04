import { decodeXml, historyChunkSize, isNetworkVisibleInUi, NETWORK_IDS } from './r2';

describe('network visibility', () => {
  // Zeronet was removed outright in "Cobalt and fixes" (#14) to hide it from the
  // page, which also stopped the API serving it — so zeronet nodes could no
  // longer sync from a snapshot. It must stay served and merely unlisted.
  it('serves zeronet from the API', () => {
    expect(NETWORK_IDS).toContain('zeronet');
  });

  it('hides zeronet from the snapshots page', () => {
    expect(isNetworkVisibleInUi('zeronet')).toBe(false);
  });

  it('keeps the public networks visible', () => {
    expect(isNetworkVisibleInUi('mainnet')).toBe(true);
    expect(isNetworkVisibleInUi('sepolia')).toBe(true);
  });

  it('treats an unknown network as visible, so a new network is not hidden by accident', () => {
    expect(isNetworkVisibleInUi('some-future-net')).toBe(true);
  });
});

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

describe('historyChunkSize', () => {
  const chunkFiles = [
    'static_files/transactions-48500000-48999999.tar.zst',
    'static_files/transactions-49000000-49499999.tar.zst',
    'static_files/transactions-49500000-49999999.tar.zst',
    'static_files/transactions-50000000-50499999.tar.zst',
    'snapshot/transactions-50500000-50999999.tar.zst',
  ];
  const chunkSizes = [10, 20, 30, 40, 50];

  it('includes four files when a partial tail chunk puts the 1,339,200-block cutoff in the fourth file', () => {
    expect(historyChunkSize(50_800_000, chunkSizes, chunkFiles)).toBe(20 + 30 + 40 + 50);
  });

  it('includes three files when they cover the entire 1,339,200-block window', () => {
    expect(historyChunkSize(50_900_000, chunkSizes, chunkFiles)).toBe(30 + 40 + 50);
  });

  it('is absent for components that are not chunked', () => {
    expect(historyChunkSize(50_758_927, undefined, undefined)).toBeUndefined();
  });

  it('is absent when chunk files cannot be matched safely to their sizes', () => {
    expect(historyChunkSize(50_758_927, [10], ['transactions.tar.zst'])).toBeUndefined();
  });
});
