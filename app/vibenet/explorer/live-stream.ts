import { connectJsonRpcStream } from '../demos/validity/lib/stream';

// Only the fields displayed in the live tables. A block stream does not supply
// transaction receipt status or indexed address totals.
export type LiveTransaction = {
  hash: string;
  block_num: number;
  tx_index: number;
  from_addr: string;
  to_addr: string | null;
};
export type LiveBlock = {
  number: number;
  hash: string;
  timestamp: number;
  timestamp_ms: number | null;
  tx_count: number;
};
type BlockWithTransactions = {
  block: LiveBlock;
  parentHash: string;
  txs: LiveTransaction[];
};
export type ExplorerSnapshot = { blocks: LiveBlock[]; txs: LiveTransaction[] };
export type StreamStatus = 'connecting' | 'live' | 'reconnecting';
type Connection = ReturnType<typeof connectJsonRpcStream>;

const WINDOW_SIZE = 10;
const REQUEST_TIMEOUT_MS = 8_000;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('Invalid block response');
  return value as Record<string, unknown>;
}

function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) {
    throw new Error('Invalid block or transaction hash');
  }
  return value.toLowerCase();
}

function quantity(value: unknown): number {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error('Invalid block quantity');
  }
  const number = Number(BigInt(value));
  if (!Number.isSafeInteger(number)) throw new Error('Block quantity exceeds safe integer range');
  return number;
}

export function parseLiveBlock(raw: unknown): BlockWithTransactions {
  const block = record(raw);
  const number = quantity(block.number);
  if (!Array.isArray(block.transactions)) throw new Error('Missing full block transactions');
  const txs = block.transactions.map((rawTx, index) => {
    const tx = record(rawTx);
    if (typeof tx.from !== 'string' || (tx.to !== null && typeof tx.to !== 'string')) {
      throw new Error('Missing transaction addresses');
    }
    return {
      hash: hash(tx.hash),
      block_num: number,
      tx_index: index,
      from_addr: tx.from,
      to_addr: tx.to,
    };
  });
  return {
    block: {
      number,
      hash: hash(block.hash),
      timestamp: quantity(block.timestamp),
      timestamp_ms: block.timestampMs == null ? null : quantity(block.timestampMs),
      tx_count: txs.length,
    },
    parentHash: hash(block.parentHash),
    txs,
  };
}

/**
 * Follow heads over WS, fetching each new full block once. On a gap or reorg,
 * walk parents to the retained chain (at most ten blocks). A reconnect rebuilds
 * the window, rather than trusting a potentially stale local fork.
 *
 * Slow consumers coalesce head notifications, not an unbounded request queue.
 * Parent traversal recovers intervening blocks still inside the visible window.
 */
export function startExplorerStream({
  url,
  onSnapshot,
  onStatus,
  connect = connectJsonRpcStream,
}: {
  url: string;
  onSnapshot: (snapshot: ExplorerSnapshot) => void;
  onStatus: (status: StreamStatus) => void;
  connect?: (url: string) => Connection;
}): () => void {
  let stopped = false;
  let retryDelay = 1_000;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let disposeConnection: (() => void) | undefined;

  function start() {
    if (stopped) return;
    let connection: Connection | undefined;
    let closed = false;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    const deadlines = new Map<ReturnType<typeof setTimeout>, () => void>();
    let chain: BlockWithTransactions[] = [];
    let pendingHash: string | undefined;
    let draining = false;
    let initialized = false;

    function dispose() {
      closed = true;
      clearTimeout(heartbeat);
      connection?.close();
      for (const [timer, reject] of deadlines) {
        clearTimeout(timer);
        reject();
      }
      deadlines.clear();
    }
    disposeConnection = dispose;

    function fail() {
      if (closed || stopped) return;
      dispose();
      onStatus('reconnecting');
      retryTimer = setTimeout(start, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }

    async function bounded<T>(promise: Promise<T>): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            const cancel = () => reject(new Error('Stream request cancelled'));
            timer = setTimeout(() => reject(new Error('Stream request timed out')), REQUEST_TIMEOUT_MS);
            deadlines.set(timer, cancel);
          }),
        ]);
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
          deadlines.delete(timer);
        }
      }
    }

    async function drain() {
      if (draining || !initialized || closed) return;
      draining = true;
      try {
        while (pendingHash && !closed) {
          const target = pendingHash;
          pendingHash = undefined;
          if (chain.some((entry) => entry.block.hash === target)) continue;
          const added: BlockWithTransactions[] = [];
          let cursor = target;
          let ancestor = -1;
          while (added.length < WINDOW_SIZE) {
            ancestor = chain.findIndex((entry) => entry.block.hash === cursor);
            if (ancestor !== -1) break;
            const block = parseLiveBlock(await bounded(connection!.request('eth_getBlockByHash', [cursor, true])));
            if (closed) return;
            if (block.block.hash !== cursor) throw new Error('Block hash mismatch');
            const child = added.at(-1);
            if (child && child.block.number !== block.block.number + 1) {
              throw new Error('Non-contiguous block stream');
            }
            added.push(block);
            if (block.block.number === 0) break;
            cursor = block.parentHash;
          }
          chain = [...added, ...(ancestor === -1 ? [] : chain.slice(ancestor))].slice(0, WINDOW_SIZE);
          onSnapshot({
            blocks: chain.map((entry) => entry.block),
            txs: chain.flatMap((entry) => [...entry.txs].reverse()).slice(0, WINDOW_SIZE),
          });
          onStatus('live');
          retryDelay = 1_000;
        }
      } catch {
        fail();
      } finally {
        draining = false;
      }
    }

    // Liveness only, not block polling: catch half-open sockets even when the
    // chain is quiet. Block changes are driven exclusively by newHeads.
    function scheduleHeartbeat() {
      heartbeat = setTimeout(() => {
        void bounded(connection!.request('eth_chainId', [])).then(() => {
          if (!closed) scheduleHeartbeat();
        }).catch(fail);
      }, 20_000);
    }

    async function open() {
      try {
        connection = connect(url);
        connection.setOnClose(fail);
        await bounded(connection.ready);
        if (closed) return;
        await bounded(connection.subscribe(['newHeads'], (raw) => {
          if (closed) return;
          try {
            pendingHash = hash(record(raw).hash);
            void drain();
          } catch {
            fail();
          }
        }));
        if (closed) return;
        // Subscribe before the snapshot so heads arriving during bootstrap
        // are buffered, rather than lost between snapshot and subscription.
        const latest = record(await bounded(connection.request('eth_getBlockByNumber', ['latest', false])));
        if (closed) return;
        pendingHash ??= hash(latest.hash);
        initialized = true;
        scheduleHeartbeat();
        await drain();
      } catch {
        fail();
      }
    }
    void open();
  }

  onStatus('connecting');
  start();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    disposeConnection?.();
  };
}
