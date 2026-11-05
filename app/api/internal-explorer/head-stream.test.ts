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

function summary(hash: string): BlockSummary {
  return {
    hash,
    number: 16,
    timestamp: 1_800_000_000,
    timestampMs: 1_800_000_000_200,
    transactionCount: 2,
    gasUsed: null,
    gasLimit: null,
    baseFeePerGas: null,
  };
}

function setup() {
  const sockets: FakeSocket[] = [];
  const fetchBlock = vi.fn(async (hash: string) => summary(hash));
  const onEnded = vi.fn();
  const hub = new HeadHub({
    wsUrl: 'wss://node.example:8546',
    fetchBlock,
    onEnded,
    connect: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  return { hub, sockets, fetchBlock, onEnded };
}

const headNotification = (hash: string) => ({
  jsonrpc: '2.0',
  method: 'eth_subscription',
  params: { subscription: '0x1', result: { number: '0x10', hash } },
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

  test('delivers each head as the block re-read by hash', async () => {
    const { hub, sockets, fetchBlock } = setup();
    const received: BlockSummary[][] = [[], []];
    hub.subscribe({ onBlock: (block) => received[0].push(block), onEnd: () => {} });
    hub.subscribe({ onBlock: (block) => received[1].push(block), onEnd: () => {} });
    sockets[0].emit('open');
    sockets[0].emit('message', headNotification(HASH));

    await vi.waitFor(() => assert.equal(received[1].length, 1));
    assert.deepEqual(fetchBlock.mock.calls, [[HASH]]);
    assert.equal(received[0][0].timestampMs, 1_800_000_000_200);
  });

  test('ignores notifications without a valid block hash', async () => {
    const { hub, sockets, fetchBlock } = setup();
    hub.subscribe({ onBlock: () => {}, onEnd: () => {} });
    sockets[0].emit('open');
    sockets[0].emit('message', headNotification('not-a-hash'));
    sockets[0].emit('message', { jsonrpc: '2.0', id: 1, result: '0x1' });

    await Promise.resolve();
    assert.equal(fetchBlock.mock.calls.length, 0);
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
