import assert from 'node:assert/strict';

import { describe, test, vi } from 'vitest';

import type { BlockSummary } from './block-list';
import { HeadHub, type HeadSocket } from './head-stream';

const HASH = `0x${'ab'.repeat(32)}`;

class FakeSocket implements HeadSocket {
  readyState = 0;
  readonly sent: unknown[] = [];
  closed = false;
  private readonly listeners = new Map<string, Array<(event?: unknown) => void>>();

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
  }

  addEventListener(type: string, listener: (event?: never) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener as (event?: unknown) => void);
    this.listeners.set(type, list);
  }

  emit(type: 'open' | 'close' | 'error'): void;
  emit(type: 'message', payload: unknown): void;
  emit(type: string, payload?: unknown) {
    const event = type === 'message' ? { data: JSON.stringify(payload) } : undefined;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function setup(
  fetchTransactionCount: (hash: string) => Promise<number | null> = async () => 7,
) {
  const sockets: FakeSocket[] = [];
  const onEnded = vi.fn();
  const hub = new HeadHub({
    wsUrl: 'wss://node.example:8546',
    fetchTransactionCount,
    onEnded,
    connect: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  return { hub, sockets, onEnded };
}

const headNotification = (hash: string, extra: Record<string, unknown> = {}) => ({
  jsonrpc: '2.0',
  method: 'eth_subscription',
  params: {
    subscription: '0x1',
    result: { number: '0x10', hash, timestamp: '0x6b49d200', gasUsed: '0x5208', ...extra },
  },
});

describe('HeadHub', () => {
  test('shares one upstream subscription across subscribers', () => {
    const { hub, sockets } = setup();
    hub.subscribe({ onBlock: () => {}, onEnd: () => {} });
    hub.subscribe({ onBlock: () => {}, onEnd: () => {} });
    sockets[0].emit('open');

    assert.equal(sockets.length, 1);
    assert.deepEqual(sockets[0].sent, [
      { jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newHeads'] },
    ]);
  });

  test('delivers each head to every subscriber with its header and transaction count', async () => {
    const fetchCount = vi.fn(async () => 7);
    const { hub, sockets } = setup(fetchCount);
    const received: BlockSummary[][] = [[], []];
    hub.subscribe({ onBlock: (block) => received[0].push(block), onEnd: () => {} });
    hub.subscribe({ onBlock: (block) => received[1].push(block), onEnd: () => {} });
    sockets[0].emit('open');
    sockets[0].emit('message', headNotification(HASH, { timestampMs: '0x1a3185c50c8' }));

    await vi.waitFor(() => assert.equal(received[1].length, 1));
    assert.deepEqual(fetchCount.mock.calls, [[HASH]]);
    assert.deepEqual(received[0][0], {
      hash: HASH,
      number: 16,
      timestamp: 1_800_000_000,
      timestampMs: 1_800_000_000_200,
      transactionCount: 7,
      gasUsed: '21000',
      gasLimit: null,
      baseFeePerGas: null,
    });
  });

  test('leaves timestampMs null when the header lacks it', async () => {
    const { hub, sockets } = setup();
    const received: BlockSummary[] = [];
    hub.subscribe({ onBlock: (block) => received.push(block), onEnd: () => {} });
    sockets[0].emit('open');
    sockets[0].emit('message', headNotification(HASH));

    await vi.waitFor(() => assert.equal(received.length, 1));
    assert.equal(received[0].timestampMs, null);
    assert.equal(received[0].timestamp, 1_800_000_000);
  });

  test('delivers heads in arrival order even when lookups finish out of order', async () => {
    const resolvers = new Map<string, (count: number) => void>();
    const { hub, sockets } = setup(
      (hash) => new Promise((resolve) => resolvers.set(hash, resolve)),
    );
    const received: string[] = [];
    hub.subscribe({ onBlock: (block) => received.push(block.hash), onEnd: () => {} });
    sockets[0].emit('open');
    const first = `0x${'01'.repeat(32)}`;
    const second = `0x${'02'.repeat(32)}`;
    sockets[0].emit('message', headNotification(first));
    sockets[0].emit('message', headNotification(second));

    resolvers.get(second)?.(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(received, []);
    resolvers.get(first)?.(1);
    await vi.waitFor(() => assert.deepEqual(received, [first, second]));
  });

  test('delivers a head without a count when the lookup fails or stalls', async () => {
    vi.useFakeTimers();
    try {
      const stalled = `0x${'03'.repeat(32)}`;
      const { hub, sockets } = setup((hash) =>
        hash === stalled ? new Promise(() => {}) : Promise.reject(new Error('rpc down')),
      );
      const received: BlockSummary[] = [];
      hub.subscribe({ onBlock: (block) => received.push(block), onEnd: () => {} });
      sockets[0].emit('open');
      sockets[0].emit('message', headNotification(HASH));
      sockets[0].emit('message', headNotification(stalled));

      await vi.advanceTimersByTimeAsync(1_000);
      assert.deepEqual(
        received.map((block) => block.transactionCount),
        [null, null],
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('ignores notifications without a valid block hash', async () => {
    const fetchCount = vi.fn(async () => 7);
    const { hub, sockets } = setup(fetchCount);
    const onBlock = vi.fn();
    hub.subscribe({ onBlock, onEnd: () => {} });
    sockets[0].emit('open');
    sockets[0].emit('message', headNotification('not-a-hash'));
    sockets[0].emit('message', { jsonrpc: '2.0', id: 1, result: '0x1' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fetchCount.mock.calls.length, 0);
    assert.equal(onBlock.mock.calls.length, 0);
  });

  test('closes the upstream when the last subscriber leaves', () => {
    const { hub, sockets, onEnded } = setup();
    const first = hub.subscribe({ onBlock: () => {}, onEnd: () => {} });
    const second = hub.subscribe({ onBlock: () => {}, onEnd: () => {} });

    first();
    assert.equal(sockets[0].closed, false);
    second();
    assert.equal(sockets[0].closed, true);
    assert.equal(onEnded.mock.calls.length, 1);
  });

  test('ends every subscriber when the upstream drops', () => {
    const { hub, sockets, onEnded } = setup();
    const ended = [vi.fn(), vi.fn()];
    hub.subscribe({ onBlock: () => {}, onEnd: ended[0] });
    hub.subscribe({ onBlock: () => {}, onEnd: ended[1] });
    sockets[0].emit('close');

    assert.equal(ended[0].mock.calls.length, 1);
    assert.equal(ended[1].mock.calls.length, 1);
    assert.equal(onEnded.mock.calls.length, 1);
  });

  test('ends subscribers when the subscription is rejected', () => {
    const { hub, sockets } = setup();
    const onEnd = vi.fn();
    hub.subscribe({ onBlock: () => {}, onEnd });
    sockets[0].emit('open');
    sockets[0].emit('message', { jsonrpc: '2.0', id: 1, error: { message: 'not supported' } });

    assert.equal(onEnd.mock.calls.length, 1);
    assert.equal(sockets[0].closed, true);
  });

  test('a subscriber added after the hub ended is ended immediately', () => {
    const { hub, sockets } = setup();
    hub.subscribe({ onBlock: () => {}, onEnd: () => {} });
    sockets[0].emit('error');

    const onEnd = vi.fn();
    hub.subscribe({ onBlock: () => {}, onEnd });
    assert.equal(onEnd.mock.calls.length, 1);
    assert.equal(sockets.length, 1);
  });
});
