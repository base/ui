import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Parser and key-handling coverage for the TIPS S3 layer.
 *
 * Only ./config is stubbed — the S3 client and bucket name. Every function under
 * test runs its real body, so the JSON parsing, bigint coercion, S3 key parsing,
 * and error handling are genuinely exercised rather than reimplemented here.
 *
 * These paths matter because the module is deliberately forgiving: a read that
 * fails for ANY reason resolves to null and the caller renders an empty state.
 * That is what made the placeholder-credentials outage look like "no data" instead
 * of "misconfigured", so the swallowing is pinned below as current behaviour.
 */

const send = vi.fn();

vi.mock('./config', () => ({
  getS3Client: () => ({ send }),
  getBucketName: () => 'test-bucket',
  getRpcUrl: () => 'http://rpc.test',
}));

/** Back the fake client with a key→body map and a listing. */
function givenS3({
  objects = {},
  listing = [],
  failWith,
}: {
  objects?: Record<string, string>;
  listing?: string[];
  failWith?: Error;
} = {}) {
  send.mockImplementation(async (command: unknown) => {
    if (failWith) throw failWith;

    if (command instanceof ListObjectsV2Command) {
      const prefix = command.input.Prefix ?? '';
      const keys = listing.filter((key) => key.startsWith(prefix));
      const max = command.input.MaxKeys ?? keys.length;
      return { Contents: keys.slice(0, max).map((Key) => ({ Key })) };
    }

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

// Also on the way out with the rejected view — see the note above
// listRejectedTransactions.
describe('formatRejectionReason', () => {
  it('renders an execution-time rejection with both bounds', () => {
    expect(
      s3.formatRejectionReason({ executionTimeExceeded: { tx_time_us: 1234567, limit_us: 2000 } }),
    ).toBe('Execution time exceeded: 1,234,567μs > 2,000μs limit');
  });

  it('passes a plain string reason through', () => {
    expect(s3.formatRejectionReason('nonce too low')).toBe('nonce too low');
  });

  it('falls back for a shape it does not recognise', () => {
    expect(s3.formatRejectionReason({})).toBe('Unknown reason');
  });
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

describe('getTransactionMetadataByHash', () => {
  // Shape taken from the producer: TransactionMetadata in base/base
  // crates/infra/audit/src/storage.rs serializes bundle_ids and nothing else.
  it('reads transactions/by_hash/<hash> and parses it', async () => {
    givenS3({
      objects: {
        'transactions/by_hash/0xtx': JSON.stringify({ bundle_ids: ['b1', 'b2'] }),
      },
    });

    const metadata = await s3.getTransactionMetadataByHash('mainnet', '0xtx');
    expect(metadata?.bundle_ids).toEqual(['b1', 'b2']);

    const command = send.mock.calls[0][0] as GetObjectCommand;
    expect(command.input.Key).toBe('transactions/by_hash/0xtx');
  });

  it('accepts a UUID bundle id, as older objects carry', async () => {
    givenS3({
      objects: {
        'transactions/by_hash/0xtx': JSON.stringify({
          bundle_ids: ['e24ea758-0000-4000-8000-000000000000'],
        }),
      },
    });

    const metadata = await s3.getTransactionMetadataByHash('mainnet', '0xtx');
    expect(metadata?.bundle_ids[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reads an object carrying no bundles', async () => {
    givenS3({ objects: { 'transactions/by_hash/0xtx': JSON.stringify({ bundle_ids: [] }) } });
    const metadata = await s3.getTransactionMetadataByHash('mainnet', '0xtx');
    expect(metadata?.bundle_ids).toEqual([]);
  });

  it('returns null for malformed JSON', async () => {
    givenS3({ objects: { 'transactions/by_hash/0xtx': 'nope' } });
    await expect(s3.getTransactionMetadataByHash('mainnet', '0xtx')).resolves.toBeNull();
  });

  it('returns null when the object is absent', async () => {
    givenS3();
    await expect(s3.getTransactionMetadataByHash('mainnet', '0xtx')).resolves.toBeNull();
  });
});

// BundleHistoryEvent in base/base crates/infra/audit/src/storage.rs is
// #[serde(tag = "event", content = "data")], so each object on the wire is
// { "event": "<Variant>", "data": { ... } } with per-variant contents.
const RECEIVED_EVENT = JSON.stringify({
  event: 'Received',
  data: {
    key: 'b1',
    timestamp: 1785270239,
    bundle: { uuid: 'b1', txs: [], block_number: '49240446' },
  },
});

const BUILDER_INCLUDED_EVENT = JSON.stringify({
  event: 'BuilderIncluded',
  data: {
    key: 'b1',
    timestamp: 1785270241,
    builder: 'sequencer-0',
    block_number: 49240446,
    flashblock_index: 2,
  },
});

// DEPRECATION (wlawt, PR #47): the transaction-observability work moves full
// transaction history to Postgres and retires S3-backed bundle history, so this
// path has an end date. Kept because it is still what production serves, and
// getBundleHistory currently feeds four routes — bundle/[hash], txn/[hash],
// block/[hash] metering enrichment, and rejected. Delete these tests in the same
// change that removes the S3 path; don't build on them and don't extend them.
describe('getBundleHistory', () => {
  it('lists under bundles/<key>/ and collects the events', async () => {
    givenS3({
      listing: ['bundles/b1/1-received', 'bundles/b1/2-included'],
      objects: {
        'bundles/b1/1-received': RECEIVED_EVENT,
        'bundles/b1/2-included': BUILDER_INCLUDED_EVENT,
      },
    });

    const history = await s3.getBundleHistory('mainnet', 'b1');
    expect(history?.history.map((e) => e.event)).toEqual(['Received', 'BuilderIncluded']);
    // The tagged-enum payload must survive parsing — the block route reaches into
    // data.bundle.meter_bundle_response off the Received event.
    expect(history?.history[0].data.bundle).toBeDefined();
    expect(history?.history[1].data.builder).toBe('sequencer-0');

    const list = send.mock.calls[0][0] as ListObjectsV2Command;
    expect(list.input.Prefix).toBe('bundles/b1/');
  });

  it('keeps the readable events when one is corrupt', async () => {
    givenS3({
      listing: ['bundles/b1/1-received', 'bundles/b1/2-broken'],
      objects: {
        'bundles/b1/1-received': RECEIVED_EVENT,
        'bundles/b1/2-broken': '{{{',
      },
    });

    const history = await s3.getBundleHistory('mainnet', 'b1');
    // One bad event must not discard the bundle's whole history.
    expect(history?.history).toHaveLength(1);
    expect(history?.history[0].event).toBe('Received');
  });

  it('returns null when the bundle has no objects', async () => {
    givenS3({ listing: [] });
    await expect(s3.getBundleHistory('mainnet', 'nope')).resolves.toBeNull();
  });
});

// DEPRECATION (wlawt, PR #47): the rejected-transactions view is being replaced
// by Niran's transaction-observability rollout. Same terms as getBundleHistory
// above — these cover what production serves today and should be deleted
// alongside the code, not carried forward or extended.
describe('listRejectedTransactions', () => {
  it('parses rejected/<block>/<hash> and sorts newest block first', async () => {
    givenS3({ listing: ['rejected/100/0xa', 'rejected/300/0xc', 'rejected/200/0xb'] });

    const rejected = await s3.listRejectedTransactions('mainnet');
    expect(rejected).toEqual([
      { blockNumber: 300, txHash: '0xc' },
      { blockNumber: 200, txHash: '0xb' },
      { blockNumber: 100, txHash: '0xa' },
    ]);
  });

  it('skips keys that are not exactly rejected/<block>/<hash>', async () => {
    givenS3({
      listing: [
        'rejected/100/0xa',
        'rejected/', // prefix marker
        'rejected/200', // missing hash
        'rejected/300/0xc/extra', // too deep
        'rejected/notanumber/0xd', // unparseable block
      ],
    });

    const rejected = await s3.listRejectedTransactions('mainnet');
    expect(rejected).toEqual([{ blockNumber: 100, txHash: '0xa' }]);
  });

  it('honours the limit as MaxKeys', async () => {
    givenS3({ listing: ['rejected/1/0xa', 'rejected/2/0xb'] });
    await s3.listRejectedTransactions('mainnet', 25);

    const list = send.mock.calls[0][0] as ListObjectsV2Command;
    expect(list.input.MaxKeys).toBe(25);
    expect(list.input.Prefix).toBe('rejected/');
  });

  it('returns an empty list when S3 fails', async () => {
    // Pins current behaviour: an outage is indistinguishable from "nothing rejected".
    givenS3({ failWith: new Error('AccessDenied') });
    await expect(s3.listRejectedTransactions('mainnet')).resolves.toEqual([]);
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

    // The round trip is the point: what we write must parse back to the same bigints.
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
