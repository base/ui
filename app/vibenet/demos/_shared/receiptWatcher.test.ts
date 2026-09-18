import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JsonRpcStream } from '../validity/lib/stream';
import { createReceiptWatcher, type RawReceipt, ReceiptTimeoutError } from './receiptWatcher';

type Hex = `0x${string}`;

const TX: Hex = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER: Hex = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const BLOCK_HASH: Hex = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

const receiptFor = (hash: Hex): RawReceipt => ({ transactionHash: hash, blockHash: BLOCK_HASH, blockNumber: '0x2140a', status: '0x1' });

/** A stand-in for connectJsonRpcStream: opens, fails, emits, and disconnects on command. */
function fakeStream() {
  const subs = new Map<string, (result: unknown) => void>();
  let onClose: (() => void) | undefined;
  let open!: () => void;
  let fail!: (err: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    open = resolve;
    fail = reject;
  });
  // A rejected `ready` that nobody awaits yet must not trip the unhandled-rejection guard.
  ready.catch(() => {});
  const close = vi.fn();
  const stream: JsonRpcStream = {
    ready,
    request: vi.fn(async () => null),
    subscribe: async (params, onResult) => {
      subs.set(String(params[0]), onResult);
      return () => {
        subs.delete(String(params[0]));
      };
    },
    setOnClose: (handler) => {
      onClose = handler;
    },
    close,
  };
  return {
    stream,
    subs,
    close,
    open: async () => {
      open();
      await vi.advanceTimersByTimeAsync(0);
    },
    fail: async () => {
      fail(new Error('WebSocket failed'));
      await vi.advanceTimersByTimeAsync(0);
    },
    emit: (name: string, result: unknown) => subs.get(name)?.(result),
    disconnect: () => onClose?.(),
  };
}

describe('createReceiptWatcher', () => {
  let clock = 0;
  beforeEach(() => {
    clock = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const tick = async (ms: number) => {
    clock += ms;
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('resolves a waiter from a pushed transactionReceipts array', async () => {
    const fake = fakeStream();
    const fetchReceipt = vi.fn(async () => null);
    const w = createReceiptWatcher({ connect: () => fake.stream, fetchReceipt, now: () => clock });
    await fake.open();
    expect(w.mode()).toBe('live');
    const pending = w.waitForReceipt(TX, { timeoutMs: 5_000 });
    fake.emit('transactionReceipts', [receiptFor(OTHER), receiptFor(TX)]);
    await expect(pending).resolves.toMatchObject({ transactionHash: TX });
    expect(fetchReceipt).not.toHaveBeenCalled();
  });

  it('resolves from the recent buffer when the receipt was pushed before the hash was known', async () => {
    const fake = fakeStream();
    const w = createReceiptWatcher({ connect: () => fake.stream, fetchReceipt: async () => null, now: () => clock });
    await fake.open();
    fake.emit('transactionReceipts', [receiptFor(TX)]);
    await expect(w.waitForReceipt(TX, { timeoutMs: 5_000 })).resolves.toMatchObject({ transactionHash: TX });
  });

  it('ignores pushed receipts for other hashes', async () => {
    const fake = fakeStream();
    const w = createReceiptWatcher({ connect: () => fake.stream, fetchReceipt: async () => null, now: () => clock });
    await fake.open();
    const outcome = expect(w.waitForReceipt(TX, { timeoutMs: 400 })).rejects.toBeInstanceOf(ReceiptTimeoutError);
    fake.emit('transactionReceipts', [receiptFor(OTHER)]);
    await tick(400);
    await outcome;
  });

  it('exposes the newest head as the anchor until it goes stale', async () => {
    const fake = fakeStream();
    const w = createReceiptWatcher({ connect: () => fake.stream, fetchReceipt: async () => null, now: () => clock });
    await fake.open();
    expect(w.latestHead()).toBeNull();
    fake.emit('newHeads', { number: '0x2140a', hash: BLOCK_HASH, timestampMs: '0x1a066162f08' });
    expect(w.latestHead()).toEqual({ number: 136_202, hash: BLOCK_HASH, timestampMs: 1_788_419_125_000 });
    await tick(1_501);
    expect(w.latestHead()).toBeNull();
  });

  it('finds a recent head by block hash for the inclusion block timestamp', async () => {
    const fake = fakeStream();
    const w = createReceiptWatcher({ connect: () => fake.stream, fetchReceipt: async () => null, now: () => clock });
    await fake.open();
    fake.emit('newHeads', { number: '0x2140a', hash: BLOCK_HASH, timestampMs: '0x1a066162f08' });
    expect(w.headByHash(BLOCK_HASH)?.timestampMs).toBe(1_788_419_125_000);
    expect(w.headByHash(OTHER)).toBeNull();
  });

  it('polls the receipt every 100 ms when there is no socket', async () => {
    let calls = 0;
    const fetchReceipt = vi.fn(async () => (++calls >= 3 ? receiptFor(TX) : null));
    const w = createReceiptWatcher({ connect: () => null, fetchReceipt, now: () => clock });
    expect(w.mode()).toBe('polling');
    const pending = w.waitForReceipt(TX, { timeoutMs: 5_000 });
    await tick(100);
    expect(fetchReceipt).toHaveBeenCalledTimes(1);
    await tick(200);
    expect(fetchReceipt).toHaveBeenCalledTimes(3);
    await expect(pending).resolves.toMatchObject({ transactionHash: TX });
    expect(w.latestHead()).toBeNull();
  });

  it('falls back to fast polling when the socket drops, then reconnects', async () => {
    const first = fakeStream();
    const second = fakeStream();
    let attempt = 0;
    const fetchReceipt = vi.fn(async () => null);
    const w = createReceiptWatcher({
      connect: () => (attempt++ === 0 ? first.stream : second.stream),
      fetchReceipt,
      now: () => clock,
      reconnectDelayMs: 1_000,
    });
    await first.open();
    const pending = w.waitForReceipt(TX, { timeoutMs: 10_000 });
    first.disconnect();
    expect(w.mode()).toBe('polling');
    await tick(300);
    expect(fetchReceipt).toHaveBeenCalledTimes(3);
    await tick(700);
    await second.open();
    expect(w.mode()).toBe('live');
    second.emit('transactionReceipts', [receiptFor(TX)]);
    await expect(pending).resolves.toMatchObject({ transactionHash: TX });
  });

  it('runs polling-only when the socket never opens', async () => {
    const fake = fakeStream();
    const w = createReceiptWatcher({ connect: () => fake.stream, fetchReceipt: async () => receiptFor(TX), now: () => clock });
    await fake.fail();
    expect(w.mode()).toBe('polling');
    expect(fake.close).toHaveBeenCalled();
    const pending = w.waitForReceipt(TX, { timeoutMs: 5_000 });
    await tick(100);
    await expect(pending).resolves.toMatchObject({ transactionHash: TX });
  });

  it('rejects with ReceiptTimeoutError and stops polling at the timeout', async () => {
    const fetchReceipt = vi.fn(async () => null);
    const w = createReceiptWatcher({ connect: () => null, fetchReceipt, now: () => clock });
    const outcome = expect(w.waitForReceipt(TX, { timeoutMs: 250 })).rejects.toMatchObject({
      name: 'ReceiptTimeoutError',
      hash: TX,
    });
    await tick(250);
    await outcome;
    const calls = fetchReceipt.mock.calls.length;
    await tick(500);
    expect(fetchReceipt).toHaveBeenCalledTimes(calls);
  });

  it('close() shuts the socket and lets an in-flight waiter finish over polling', async () => {
    const fake = fakeStream();
    let calls = 0;
    const fetchReceipt = vi.fn(async () => (++calls >= 2 ? receiptFor(TX) : null));
    const w = createReceiptWatcher({ connect: () => fake.stream, fetchReceipt, now: () => clock });
    await fake.open();
    const pending = w.waitForReceipt(TX, { timeoutMs: 5_000 });
    w.close();
    expect(w.mode()).toBe('closed');
    expect(fake.close).toHaveBeenCalled();
    await tick(1_000);
    await expect(pending).resolves.toMatchObject({ transactionHash: TX });
  });
});
