import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseLiveBlock, startExplorerStream, type ExplorerSnapshot, type StreamStatus } from './live-stream';

const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const hex = (n: number) => `0x${n.toString(16)}`;
function block(n: number, id = n, parent = n - 1) {
  return {
    number: hex(n), hash: hash(id), parentHash: hash(Math.max(0, parent)),
    timestamp: hex(1_700_000_000), timestampMs: hex(1_700_000_000_200),
    transactions: [{ hash: hash(id + 10_000), from: '0xabc', to: null }],
  };
}

function harness(initialHead = 12) {
  const blocks = new Map(Array.from({ length: 50 }, (_, n) => [hash(n), block(n)]));
  let head = initialHead;
  const connections: ReturnType<typeof makeConnection>[] = [];
  function makeConnection() {
    let onHead: ((raw: unknown) => void) | undefined;
    let onClose: (() => void) | undefined;
    const connection = {
      ready: Promise.resolve(),
      request: vi.fn(async (method: string, params: unknown[]): Promise<unknown> => {
        if (method === 'eth_getBlockByNumber') return { hash: hash(head) };
        if (method === 'eth_chainId') return '0x1';
        return blocks.get(String(params[0])) ?? null;
      }),
      subscribe: vi.fn(async (_params: unknown[], handler: (raw: unknown) => void) => {
        onHead = handler;
        return () => {};
      }),
      setOnClose: (handler: () => void) => { onClose = handler; },
      close: vi.fn(),
      emit: (id: number) => onHead?.({ hash: hash(id) }),
      disconnect: () => onClose?.(),
    };
    connections.push(connection);
    return connection;
  }
  const snapshots: ExplorerSnapshot[] = [];
  const statuses: StreamStatus[] = [];
  const connect = vi.fn(makeConnection);
  const stop = startExplorerStream({
    url: 'wss://test', connect,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onStatus: (status) => statuses.push(status),
  });
  return { blocks, connections, snapshots, statuses, connect, stop, setHead: (n: number) => { head = n; } };
}

// Drain promise continuations without triggering retry/heartbeat timers.
async function flush() {
  for (let n = 0; n < 150; n++) await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

describe('live explorer block stream', () => {
  it('parses millisecond timestamps and contract creation without inventing receipt status', () => {
    const parsed = parseLiveBlock(block(1));
    expect(parsed.block.timestamp_ms).toBe(1_700_000_000_200);
    expect(parsed.txs[0].to_addr).toBeNull();
    expect(parsed.txs[0]).not.toHaveProperty('status');
    expect(() => parseLiveBlock({ ...block(1), transactions: [hash(1)] })).toThrow();
    expect(() => parseLiveBlock({ ...block(1), number: '0x20000000000000' })).toThrow();
  });

  it('subscribes before bootstrap, then fetches only new blocks without polling', async () => {
    vi.useFakeTimers();
    const h = harness();
    await flush();
    const c = h.connections[0];
    expect(c.subscribe).toHaveBeenCalledWith(['newHeads'], expect.any(Function));
    expect(c.subscribe.mock.invocationCallOrder[0]).toBeLessThan(c.request.mock.invocationCallOrder[0]);
    expect(h.snapshots.at(-1)?.blocks.map((b) => b.number)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect(h.snapshots.at(-1)?.txs).toHaveLength(10);
    c.request.mockClear();
    c.emit(13);
    await flush();
    expect(c.request).toHaveBeenCalledExactlyOnceWith('eth_getBlockByHash', [hash(13), true]);
    expect(h.snapshots.at(-1)?.blocks[0].number).toBe(13);
    c.emit(13);
    c.emit(12);
    await flush();
    expect(c.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(c.request).toHaveBeenLastCalledWith('eth_chainId', []);
    expect(c.request.mock.calls.filter(([method]) => method === 'eth_getBlockByNumber')).toHaveLength(0);
    h.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backfills missed heads and replaces orphaned blocks and transactions', async () => {
    const h = harness();
    await flush();
    const c = h.connections[0];
    c.emit(15);
    await flush();
    expect(h.snapshots.at(-1)?.blocks.slice(0, 4).map((b) => b.number)).toEqual([15, 14, 13, 12]);
    h.blocks.set(hash(115), block(15, 115, 14));
    c.emit(115);
    await flush();
    expect(h.snapshots.at(-1)?.blocks[0].hash).toBe(hash(115));
    expect(h.snapshots.at(-1)?.txs.some((tx) => tx.hash === hash(10_015))).toBe(false);
    expect(h.snapshots.at(-1)?.txs[0].hash).toBe(hash(10_115));
    h.stop();
  });

  it('bounds catch-up and coalesces bursts while a fetch is outstanding', async () => {
    const h = harness();
    await flush();
    const c = h.connections[0];
    let resolve!: (value: unknown) => void;
    c.request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    c.emit(13);
    c.emit(14);
    c.emit(40);
    resolve(block(13));
    await flush();
    expect(h.snapshots.at(-1)?.blocks.map((b) => b.number)).toEqual([40, 39, 38, 37, 36, 35, 34, 33, 32, 31]);
    expect(c.request.mock.calls.filter(([, params]) => params[0] === hash(14))).toHaveLength(0);
    h.stop();
  });

  it('reconnects with a fresh snapshot, and stops all work on cleanup', async () => {
    vi.useFakeTimers();
    const h = harness();
    await flush();
    h.setHead(30);
    h.connections[0].disconnect();
    expect(h.statuses.at(-1)).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(h.snapshots.at(-1)?.blocks[0].number).toBe(30);
    expect(h.statuses.at(-1)).toBe('live');
    h.stop();
    h.connections[1].emit(31);
    h.connections[1].disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(h.snapshots.at(-1)?.blocks[0].number).toBe(30);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out stalled requests and ignores late responses from the old connection', async () => {
    vi.useFakeTimers();
    const h = harness();
    await flush();
    let resolve!: (value: unknown) => void;
    h.connections[0].request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    h.connections[0].emit(13);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(h.statuses.at(-1)).toBe('reconnecting');
    resolve(block(13));
    await flush();
    expect(h.snapshots.at(-1)?.blocks[0].number).toBe(12);
    h.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps heads delivered during bootstrap and handles genesis', async () => {
    const h = harness(0);
    h.connections[0].subscribe.mockImplementationOnce(async (_params, onHead) => {
      onHead({ hash: hash(1) });
      return () => {};
    });
    await flush();
    expect(h.snapshots.at(-1)?.blocks.map((b) => b.number)).toEqual([1, 0]);
    h.stop();
  });
});
