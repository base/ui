import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Coverage for the TIPS block cache.
 *
 * Deliberately scoped: the transaction-observability work moves transaction and
 * bundle history to Postgres and retires the rejected view, so getBundleHistory,
 * getTransactionMetadataByHash, listRejectedTransactions, getRejectedTransaction,
 * and formatRejectionReason are all on their way out and are left uncovered
 * rather than pinned in place. What remains here is the block cache — this app's
 * own read-through cache of RPC block data, which the migration does not touch.
 *
 * Only ./config is stubbed (the S3 client and bucket name), so the functions run
 * their real bodies and the JSON parsing and bigint coercion are genuinely
 * exercised rather than reimplemented in the test.
 */

const send = vi.fn();

vi.mock('./config', () => ({
  getS3Client: () => ({ send }),
  getBucketName: () => 'test-bucket',
  getRpcUrl: () => 'http://rpc.test',
}));

/** Back the fake client with a key→body map. */
function givenS3({
  objects = {},
  failWith,
}: { objects?: Record<string, string>; failWith?: Error } = {}) {
  send.mockImplementation(async (command: unknown) => {
    if (failWith) throw failWith;

    if (command instanceof GetObjectCommand) {
      const body = objects[command.input.Key as string];
      // Mirrors S3: a missing key rejects rather than resolving empty.
      if (body === undefined) throw new Error('NoSuchKey');
      return { Body: { transformToString: async () => body } };
    }

    if (command instanceof PutObjectCommand) return {};
    throw new Error('unexpected command');
  });
}

let s3: typeof import('./s3');

beforeEach(async () => {
  vi.resetModules();
  send.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  s3 = await import('./s3');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getBlockFromCache', () => {
  const blockJson = JSON.stringify({
    hash: '0xabc',
    number: '49240446',
    timestamp: '1785270239',
    gasUsed: '15000000',
    gasLimit: '60000000',
    cachedAt: 1785270240000,
    transactions: [
      { hash: '0xt1', from: '0xf', to: '0xt', gasLimit: '21000', index: 0, bundleId: null },
      { hash: '0xt2', from: '0xf', to: null, index: 1, bundleId: 'b1', meterBundleResponse: { x: 1 } },
    ],
  });

  it('coerces the numeric block fields to bigint', async () => {
    givenS3({ objects: { 'blocks/0xabc': blockJson } });
    const block = await s3.getBlockFromCache('mainnet', '0xabc');

    expect(block?.number).toBe(49240446n);
    expect(block?.timestamp).toBe(1785270239n);
    expect(block?.gasUsed).toBe(15000000n);
    expect(block?.gasLimit).toBe(60000000n);
  });

  it('coerces per-transaction gasLimit and defaults a missing one to 0n', async () => {
    givenS3({ objects: { 'blocks/0xabc': blockJson } });
    const block = await s3.getBlockFromCache('mainnet', '0xabc');

    expect(block?.transactions[0].gasLimit).toBe(21000n);
    // tx2 has no gasLimit — must not become NaN or throw.
    expect(block?.transactions[1].gasLimit).toBe(0n);
  });

  it('normalises a missing meterBundleResponse to null', async () => {
    givenS3({ objects: { 'blocks/0xabc': blockJson } });
    const block = await s3.getBlockFromCache('mainnet', '0xabc');

    expect(block?.transactions[0].meterBundleResponse).toBeNull();
    expect(block?.transactions[1].meterBundleResponse).toEqual({ x: 1 });
  });

  it('reads from the blocks/<hash> key', async () => {
    givenS3({ objects: { 'blocks/0xabc': blockJson } });
    await s3.getBlockFromCache('mainnet', '0xabc');

    const command = send.mock.calls[0][0] as GetObjectCommand;
    expect(command.input.Key).toBe('blocks/0xabc');
  });

  it('returns null for malformed JSON instead of throwing', async () => {
    givenS3({ objects: { 'blocks/0xabc': '{ not json' } });
    await expect(s3.getBlockFromCache('mainnet', '0xabc')).resolves.toBeNull();
  });

  it('returns null when a numeric field is not bigint-coercible', async () => {
    givenS3({ objects: { 'blocks/0xabc': JSON.stringify({ number: 'abc', transactions: [] }) } });
    await expect(s3.getBlockFromCache('mainnet', '0xabc')).resolves.toBeNull();
  });

  it('returns null when the object is absent', async () => {
    givenS3();
    await expect(s3.getBlockFromCache('mainnet', '0xmissing')).resolves.toBeNull();
  });
});

describe('cacheBlockData', () => {
  it('serialises bigints as strings so the cache round-trips', async () => {
    givenS3();
    await s3.cacheBlockData('mainnet', {
      hash: '0xabc',
      number: 1n,
      timestamp: 2n,
      gasUsed: 3n,
      gasLimit: 4n,
      cachedAt: 5,
      transactions: [
        {
          hash: '0xt',
          from: '0xf',
          to: null,
          gasLimit: 21000n,
          bundleId: null,
          index: 0,
          meterBundleResponse: null,
        },
      ],
    });

    const put = send.mock.calls[0][0] as PutObjectCommand;
    expect(put.input.Key).toBe('blocks/0xabc');
    const body = JSON.parse(put.input.Body as string);
    expect(body.number).toBe('1');
    expect(body.transactions[0].gasLimit).toBe('21000');

    // The round trip is the point: what we write must parse back to the same
    // bigints, and nothing else asserts that the two halves agree.
    givenS3({ objects: { 'blocks/0xabc': put.input.Body as string } });
    const restored = await s3.getBlockFromCache('mainnet', '0xabc');
    expect(restored?.number).toBe(1n);
    expect(restored?.transactions[0].gasLimit).toBe(21000n);
  });

  it('does not throw when the write fails', async () => {
    givenS3({ failWith: new Error('AccessDenied') });
    await expect(
      s3.cacheBlockData('mainnet', {
        hash: '0xabc',
        number: 1n,
        timestamp: 2n,
        gasUsed: 3n,
        gasLimit: 4n,
        cachedAt: 5,
        transactions: [],
      }),
    ).resolves.toBeUndefined();
  });
});
