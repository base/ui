// Watches vibenet's block stream so a transaction's inclusion can be reported
// in chain time. Two subscriptions on one WebSocket: `newHeads` keeps the
// newest block (the anchor a broadcast is measured from, and the source of
// each block's Cobalt `timestampMs`), and `transactionReceipts` delivers every
// receipt the moment its block is sealed, so a waiter resolves without polling.
// When the socket is unavailable the watcher polls `eth_getTransactionReceipt`
// over HTTP instead; there is then no anchor, so only block and slot are shown.
//
// Framework-free: no React, no `window`, timers via globalThis, so it runs
// under vitest with a fake stream.

import type { JsonRpcStream } from '../validity/lib/stream';
import { quantityToNumber } from './inclusion';

type Hex = `0x${string}`;

export type WatchedHead = {
  number: number;
  hash: Hex | null;
  /** Cobalt millisecond timestamp, or null on chains without it. */
  timestampMs: number | null;
};

export type RawReceipt = {
  transactionHash?: Hex;
  blockHash?: Hex;
  blockNumber?: Hex;
  status?: Hex;
  [key: string]: unknown;
};

export class ReceiptTimeoutError extends Error {
  readonly hash: Hex;
  constructor(hash: Hex) {
    super(`Timed out waiting for the receipt of ${hash}.`);
    this.name = 'ReceiptTimeoutError';
    this.hash = hash;
  }
}

export type ReceiptWatcherDeps = {
  /** Opens the WebSocket; return null to run polling-only (no socket URL, other chain). */
  connect: () => JsonRpcStream | null;
  /** HTTP `eth_getTransactionReceipt`; null while the transaction is pending. */
  fetchReceipt: (hash: Hex) => Promise<RawReceipt | null>;
  /** Clock for head staleness only; never surfaces in a displayed number. */
  now?: () => number;
  /** Receipt poll cadence while the socket is down. */
  pollIntervalMs?: number;
  /** Receipt poll cadence while live, in case a push is missed. */
  safetyPollMs?: number;
  /** A head older than this is no anchor: the socket has stalled. */
  headStaleMs?: number;
  /** First reconnect delay; doubles up to ten times this. */
  reconnectDelayMs?: number;
  /** How long a pushed receipt is kept for a waiter that registers late. */
  recentReceiptsMs?: number;
  /** Heads kept by hash for `headByHash`. */
  headRing?: number;
};

export type WatcherMode = 'connecting' | 'live' | 'polling' | 'closed';

export type ReceiptWatcher = {
  /** The newest head received over the socket, or null when there is none fresh enough to anchor on. */
  latestHead(): WatchedHead | null;
  /** A recent head by block hash, for the inclusion block's timestamp. */
  headByHash(hash: Hex): WatchedHead | null;
  /** Resolves with the receipt as soon as it is pushed or polled; rejects with ReceiptTimeoutError. */
  waitForReceipt(hash: Hex, opts: { timeoutMs: number }): Promise<RawReceipt>;
  mode(): WatcherMode;
  close(): void;
};

type Waiter = {
  hash: Hex;
  settle: (receipt: RawReceipt | null) => void;
  pollTimer: ReturnType<typeof setTimeout> | undefined;
  done: boolean;
};

type RawHead = { number?: unknown; hash?: unknown; timestampMs?: unknown };

function parseHead(raw: unknown): WatchedHead | null {
  if (!raw || typeof raw !== 'object') return null;
  const head = raw as RawHead;
  const number = quantityToNumber(head.number);
  if (number === null) return null;
  const hash = typeof head.hash === 'string' && head.hash.startsWith('0x') ? (head.hash as Hex) : null;
  return { number, hash, timestampMs: quantityToNumber(head.timestampMs) };
}

export function createReceiptWatcher(deps: ReceiptWatcherDeps): ReceiptWatcher {
  const now = deps.now ?? (() => Date.now());
  const pollIntervalMs = deps.pollIntervalMs ?? 100;
  const safetyPollMs = deps.safetyPollMs ?? 1_000;
  const headStaleMs = deps.headStaleMs ?? 1_500;
  const baseReconnectMs = deps.reconnectDelayMs ?? 1_000;
  const recentReceiptsMs = deps.recentReceiptsMs ?? 30_000;
  const headRing = deps.headRing ?? 64;

  let mode: WatcherMode = 'connecting';
  let closed = false;
  let stream: JsonRpcStream | null = null;
  let reconnectDelay = baseReconnectMs;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  let latest: { head: WatchedHead; seenAt: number } | null = null;
  const heads = new Map<Hex, WatchedHead>();
  const recent = new Map<Hex, { receipt: RawReceipt; seenAt: number }>();
  const waiters = new Map<Hex, Set<Waiter>>();

  const onHead = (raw: unknown) => {
    const head = parseHead(raw);
    if (!head) return;
    latest = { head, seenAt: now() };
    if (head.hash) {
      heads.set(head.hash, head);
      while (heads.size > headRing) {
        const oldest = heads.keys().next().value;
        if (oldest === undefined) break;
        heads.delete(oldest);
      }
    }
  };

  const settleWaiters = (hash: Hex, receipt: RawReceipt) => {
    const set = waiters.get(hash);
    if (!set) return;
    waiters.delete(hash);
    for (const waiter of set) waiter.settle(receipt);
  };

  const onReceipts = (raw: unknown) => {
    if (!Array.isArray(raw)) return;
    const seenAt = now();
    for (const [hash, entry] of recent) if (seenAt - entry.seenAt > recentReceiptsMs) recent.delete(hash);
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const receipt = item as RawReceipt;
      const hash = receipt.transactionHash;
      if (typeof hash !== 'string') continue;
      recent.set(hash, { receipt, seenAt });
      settleWaiters(hash, receipt);
    }
  };

  const currentPollDelay = () => (mode === 'live' ? safetyPollMs : pollIntervalMs);

  const rearmWaiters = () => {
    for (const set of waiters.values()) {
      for (const waiter of set) {
        if (waiter.done) continue;
        if (waiter.pollTimer !== undefined) clearTimeout(waiter.pollTimer);
        waiter.pollTimer = setTimeout(() => void pollOnce(waiter), currentPollDelay());
      }
    }
  };

  const pollOnce = async (waiter: Waiter) => {
    waiter.pollTimer = undefined;
    if (waiter.done) return;
    let receipt: RawReceipt | null = null;
    try {
      receipt = await deps.fetchReceipt(waiter.hash);
    } catch {
      receipt = null;
    }
    if (waiter.done) return;
    if (receipt) {
      waiters.get(waiter.hash)?.delete(waiter);
      waiter.settle(receipt);
      return;
    }
    waiter.pollTimer = setTimeout(() => void pollOnce(waiter), currentPollDelay());
  };

  const onDisconnected = () => {
    latest = null;
    if (closed) {
      mode = 'closed';
      return;
    }
    mode = 'polling';
    rearmWaiters();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, baseReconnectMs * 10);
  };

  const connect = () => {
    if (closed) return;
    let next: JsonRpcStream | null = null;
    try {
      next = deps.connect();
    } catch {
      next = null;
    }
    if (!next) {
      mode = 'polling';
      return;
    }
    const s = next;
    stream = s;
    mode = 'connecting';
    s.setOnClose(() => {
      if (stream !== s) return;
      stream = null;
      onDisconnected();
    });
    void (async () => {
      await s.ready;
      await s.subscribe(['newHeads'], onHead);
      await s.subscribe(['transactionReceipts'], onReceipts);
      if (stream !== s || closed) return;
      mode = 'live';
      reconnectDelay = baseReconnectMs;
    })().catch(() => {
      if (stream !== s) return;
      stream = null;
      s.close();
      onDisconnected();
    });
  };

  connect();

  return {
    latestHead() {
      if (!latest || now() - latest.seenAt > headStaleMs) return null;
      return latest.head;
    },
    headByHash(hash) {
      return heads.get(hash) ?? null;
    },
    mode() {
      return mode;
    },
    waitForReceipt(hash, { timeoutMs }) {
      return new Promise<RawReceipt>((resolve, reject) => {
        const hit = recent.get(hash);
        if (hit) {
          resolve(hit.receipt);
          return;
        }
        let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
        const waiter: Waiter = {
          hash,
          done: false,
          pollTimer: undefined,
          settle: (receipt) => {
            if (waiter.done) return;
            waiter.done = true;
            if (waiter.pollTimer !== undefined) clearTimeout(waiter.pollTimer);
            if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
            const set = waiters.get(hash);
            if (set) {
              set.delete(waiter);
              if (set.size === 0) waiters.delete(hash);
            }
            if (receipt) resolve(receipt);
            else reject(new ReceiptTimeoutError(hash));
          },
        };
        const set = waiters.get(hash) ?? new Set<Waiter>();
        set.add(waiter);
        waiters.set(hash, set);
        timeoutTimer = setTimeout(() => waiter.settle(null), timeoutMs);
        waiter.pollTimer = setTimeout(() => void pollOnce(waiter), currentPollDelay());
      });
    },
    close() {
      closed = true;
      mode = 'closed';
      latest = null;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      const s = stream;
      stream = null;
      s?.close();
      // No more pushes are coming: anything still waiting polls at full speed.
      rearmWaiters();
    },
  };
}
