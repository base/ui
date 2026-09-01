import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectJsonRpcStream, dispatchSubscriptionListener, headNumber } from './stream';

describe('headNumber', () => {
  it('reads a hex block number', () => {
    expect(headNumber({ number: '0x6fb4' })).toBe(28596n);
  });

  it('rejects a missing number', () => {
    expect(headNumber({ number: 'nope' as `0x${string}` })).toBeNull();
  });
});

describe('dispatchSubscriptionListener', () => {
  it('invokes a registered callback for a string id', () => {
    const received: unknown[] = [];
    const listeners = new Map<string, (result: unknown) => void>([['0xsub', (result) => received.push(result)]]);
    dispatchSubscriptionListener(listeners, '0xsub', { number: '0x1' });
    expect(received).toEqual([{ number: '0x1' }]);
  });

  it('invokes a registered callback for a numeric id', () => {
    const received: unknown[] = [];
    const listeners = new Map<string, (result: unknown) => void>([['7', (result) => received.push(result)]]);
    dispatchSubscriptionListener(listeners, 7, 'ok');
    expect(received).toEqual(['ok']);
  });

  it('leaves the listener registered so later notifications still fire', () => {
    const received: unknown[] = [];
    const listeners = new Map<string, (result: unknown) => void>([['0xsub', (result) => received.push(result)]]);
    dispatchSubscriptionListener(listeners, '0xsub', 1);
    dispatchSubscriptionListener(listeners, '0xsub', 2);
    expect(received).toEqual([1, 2]);
    expect(listeners.has('0xsub')).toBe(true);
  });

  it('ignores unknown ids and non-function entries without throwing', () => {
    const listeners = new Map<string, (result: unknown) => void>();
    listeners.set('toString', 'not-a-function' as unknown as (result: unknown) => void);
    expect(() => dispatchSubscriptionListener(listeners, 'missing', 1)).not.toThrow();
    expect(() => dispatchSubscriptionListener(listeners, 'toString', 1)).not.toThrow();
    expect(() => dispatchSubscriptionListener(listeners, { method: 'toString' }, 1)).not.toThrow();
    expect(() => dispatchSubscriptionListener(listeners, undefined, 1)).not.toThrow();
  });
});

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private readonly handlers = new Map<string, Array<(event: unknown) => void>>();

  constructor(public url: string) {
    lastSocket = this;
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch('open', {});
  }

  receive(body: unknown) {
    this.dispatch('message', { data: JSON.stringify(body) });
  }

  private dispatch(type: string, event: unknown) {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }
}

let lastSocket: FakeWebSocket | undefined;

function installStreamGlobals() {
  lastSocket = undefined;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('window', { setTimeout, clearTimeout });
}

describe('connectJsonRpcStream subscription dispatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers eth_subscription results only for ids this client registered', async () => {
    installStreamGlobals();
    const stream = connectJsonRpcStream('wss://example.test');
    lastSocket!.open();
    await stream.ready;

    const received: unknown[] = [];
    const subscribePromise = stream.subscribe(['newHeads'], (result) => received.push(result));
    await Promise.resolve();
    const request = JSON.parse(lastSocket!.sent[0]!) as { id: number };
    lastSocket!.receive({ jsonrpc: '2.0', id: request.id, result: '0xsub' });
    const unsubscribe = await subscribePromise;

    lastSocket!.receive({
      method: 'eth_subscription',
      params: { subscription: '0xsub', result: { number: '0x1' } },
    });
    lastSocket!.receive({
      method: 'eth_subscription',
      params: { subscription: 'toString', result: { number: '0x2' } },
    });
    lastSocket!.receive({
      method: 'eth_subscription',
      params: { subscription: { not: 'an-id' }, result: { number: '0x3' } },
    });

    expect(received).toEqual([{ number: '0x1' }]);
    unsubscribe();
    stream.close();
  });
});
