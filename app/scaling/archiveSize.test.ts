import { readFileSync } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

import { ARCHIVE_SNAPSHOTS_URL, fetchArchiveSize, loadArchiveSize, parseArchiveSize, withArchiveSize } from './archiveSize';
import type { Snapshot } from './snapshot.mjs';

// Synthetic sizes in the chain.base.org shape, with extra fields the parser must ignore.
const ENTRIES = [
  { network: 'sepolia', profile: 'archive', block: 9, date: '2026-01-01', size: 1e12, components: [] },
  {
    chainId: '8453', network: 'mainnet', profile: 'archive', block: 1_234_567, timestamp: '1767225600', date: '2026-01-01', size: 6e12, isModular: true,
    components: [{ name: 'state', displayName: 'State', size: 1e12 }, { name: 'proofs', size: 1.5e12 }, { name: 'receipts', size: 2e12, fullSize: 1e11 }],
  },
];
const ARCHIVE = { size: 6e12, sizeWithoutProofs: 4.5e12, block: 1_234_567, date: '2026-01-01', source: 'chain.base.org' };
const fixture = (network: string): Snapshot => ({ ...JSON.parse(readFileSync(new URL('./fixtures/synthetic.v2.json', import.meta.url), 'utf8')), network });

afterEach(() => vi.restoreAllMocks());

it('reads the mainnet archive entry, total including proofs and without them', () => {
  expect(parseArchiveSize(ENTRIES)).toEqual(ARCHIVE);
});

it('rejects a response that is not the expected shape', () => {
  const mainnet = ENTRIES[1];
  for (const bad of [
    {},
    [ENTRIES[0]],
    [{ ...mainnet, size: '6e12' }],
    [{ ...mainnet, size: 0 }],
    [{ ...mainnet, block: 1.5 }],
    [{ ...mainnet, date: 'yesterday' }],
    [{ ...mainnet, components: null }],
    [{ ...mainnet, components: [{ name: 'proofs', size: -1 }] }],
    [{ ...mainnet, components: [{ name: 'proofs', size: 7e12 }] }],
  ]) expect(parseArchiveSize(bad)).toBeNull();
});

it('fetches with a timeout and throws on a failed or malformed response', async () => {
  const fetchImpl = vi.fn(async () => Response.json(ENTRIES));
  expect(await fetchArchiveSize(fetchImpl as unknown as typeof fetch)).toEqual(ARCHIVE);
  expect(fetchImpl).toHaveBeenCalledWith(ARCHIVE_SNAPSHOTS_URL, { signal: expect.any(AbortSignal) });
  await expect(fetchArchiveSize((async () => new Response('down', { status: 502 })) as typeof fetch)).rejects.toThrow('502');
  await expect(fetchArchiveSize((async () => Response.json([{ network: 'mainnet' }])) as typeof fetch)).rejects.toThrow('unexpected response shape');
});

it('falls back to null on a timeout, logging why', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const timeout = () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
  expect(await loadArchiveSize(timeout)).toBeNull();
  expect(warn).toHaveBeenCalledOnce();
  expect(await loadArchiveSize(async () => ARCHIVE as never)).toEqual(ARCHIVE);
});

it('replaces a mainnet snapshot’s archive size and leaves others or a failed fetch alone', () => {
  const mainnet = fixture('Base mainnet');
  expect(withArchiveSize(mainnet, ARCHIVE as never).production!.archiveBytes).toEqual({
    value: 6e12, asOf: '2026-01-01', source: 'chain.base.org snapshot, block 1,234,567', note: 'incl. proofs',
  });
  expect(withArchiveSize(mainnet, ARCHIVE as never).production!.stateBytesPerGas).toEqual(mainnet.production!.stateBytesPerGas);
  expect(withArchiveSize(mainnet, null)).toBe(mainnet);
  const synthetic = fixture('synthetic-testnet');
  expect(withArchiveSize(synthetic, ARCHIVE as never)).toBe(synthetic);
});
