// Live block heads for the Internal Explorer. One upstream `eth_subscribe`
// newHeads WebSocket per endpoint is shared by every connected browser, and
// each head is re-read over HTTP by hash: newHeads carries no transaction list,
// and RPC proxies that re-encode headers can drop Base's `timestampMs`.
// Server-only.
import { fetchBlockSummaryByHash, type BlockSummary } from './block-list';

const CONNECT_TIMEOUT_MS = 10_000;
const SUBSCRIBE_REQUEST_ID = 1;
const BLOCK_HASH = /^0x[0-9a-f]{64}$/i;

/** The subset of the WHATWG WebSocket the hub uses; injectable for tests. */
export interface HeadSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface HeadSubscriber {
  onBlock: (block: BlockSummary) => void;
  /** Called once when the upstream stream ends; the subscriber is already removed. */
  onEnd: () => void;
}

export interface HeadHubOptions {
  wsUrl: string;
  fetchBlock: (hash: string) => Promise<BlockSummary | null>;
  connect?: (url: string) => HeadSocket;
  /** Called once the hub has ended, so a registry can drop it. */
  onEnded?: () => void;
}

export class HeadHub {
  private readonly subscribers = new Set<HeadSubscriber>();
  private socket: HeadSocket | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private ended = false;

  constructor(private readonly options: HeadHubOptions) {}

  /** Add a subscriber, opening the upstream on first use. Returns an unsubscribe function. */
  subscribe(subscriber: HeadSubscriber): () => void {
    if (this.ended) {
      subscriber.onEnd();
      return () => {};
    }
    this.subscribers.add(subscriber);
    if (!this.socket) this.open();
    return () => {
      this.subscribers.delete(subscriber);
      if (this.subscribers.size === 0) this.end();
    };
  }

  private open() {
    const connect = this.options.connect ?? ((url: string) => new WebSocket(url));
    let socket: HeadSocket;
    try {
      socket = connect(this.options.wsUrl);
    } catch (error) {
      console.error('Internal Explorer head stream failed to connect:', error);
      this.end();
      return;
    }
    this.socket = socket;
    this.connectTimer = setTimeout(() => this.end(), CONNECT_TIMEOUT_MS);

    socket.addEventListener('open', () => {
      clearTimeout(this.connectTimer);
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: SUBSCRIBE_REQUEST_ID,
          method: 'eth_subscribe',
          params: ['newHeads'],
        }),
      );
    });
    socket.addEventListener('message', (event) => this.handleMessage(event.data));
    socket.addEventListener('error', () => this.end());
    socket.addEventListener('close', () => this.end());
  }

  private handleMessage(data: unknown) {
    let message: {
      id?: unknown;
      error?: unknown;
      method?: unknown;
      params?: { result?: { hash?: unknown } };
    };
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }

    if (message.id === SUBSCRIBE_REQUEST_ID && message.error) {
      console.error('Internal Explorer head stream subscription rejected:', message.error);
      this.end();
      return;
    }
    if (message.method !== 'eth_subscription') return;

    const hash = message.params?.result?.hash;
    if (typeof hash !== 'string' || !BLOCK_HASH.test(hash)) return;

    void this.options
      .fetchBlock(hash)
      .then((block) => {
        if (!block || this.ended) return;
        for (const subscriber of this.subscribers) subscriber.onBlock(block);
      })
      .catch(() => {});
  }

  private end() {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.connectTimer);
    try {
      this.socket?.close();
    } catch {
      // Already closed.
    }
    const subscribers = [...this.subscribers];
    this.subscribers.clear();
    this.options.onEnded?.();
    for (const subscriber of subscribers) subscriber.onEnd();
  }
}

const hubs = new Map<string, HeadHub>();

/** Subscribe to live heads for a chain, sharing one upstream socket per WebSocket URL. */
export function subscribeToHeads(
  wsUrl: string,
  rpcUrl: string,
  subscriber: HeadSubscriber,
): () => void {
  let hub = hubs.get(wsUrl);
  if (!hub) {
    const created = new HeadHub({
      wsUrl,
      fetchBlock: (hash) => fetchBlockSummaryByHash(rpcUrl, hash),
      onEnded: () => {
        if (hubs.get(wsUrl) === created) hubs.delete(wsUrl);
      },
    });
    hubs.set(wsUrl, created);
    hub = created;
  }
  return hub.subscribe(subscriber);
}
