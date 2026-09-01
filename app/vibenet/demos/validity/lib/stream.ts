type Hex = `0x${string}`;

type JsonRpcSuccess = { id?: unknown; result?: unknown; error?: { message?: string } };
type SubscriptionNote = {
  method?: string;
  params?: { subscription?: string; result?: unknown };
};

export type StreamHead = {
  number: Hex;
  timestamp?: Hex;
  hash?: Hex;
  baseFeePerGas?: Hex;
};

export type StreamLog = {
  address: Hex;
  topics: Hex[];
  data: Hex;
  transactionHash?: Hex;
  blockNumber?: Hex;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type SubscriptionListener = (result: unknown) => void;

function isRpcId(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/** Invoke a Map-registered callback; never treats `id` as a method name. */
export function dispatchSubscriptionListener(
  listeners: Map<string, SubscriptionListener>,
  id: unknown,
  result: unknown,
): void {
  if (!isRpcId(id)) return;
  const listener = listeners.get(String(id));
  if (typeof listener !== 'function') return;
  listener(result);
}

/** Browser JSON-RPC WebSocket with eth_subscribe. */
export function connectJsonRpcStream(url: string) {
  const ws = new WebSocket(url);
  const pending = new Map<number, Pending>();
  const listeners = new Map<string, SubscriptionListener>();
  let nextId = 1;
  let opened = false;
  let onClose: (() => void) | undefined;

  const ready = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('WebSocket timed out')), 8_000);
    ws.addEventListener('open', () => {
      window.clearTimeout(timer);
      opened = true;
      resolve();
    });
    ws.addEventListener('error', () => {
      window.clearTimeout(timer);
      if (!opened) reject(new Error('WebSocket failed'));
    });
  });

  ws.addEventListener('message', (event) => {
    let body: JsonRpcSuccess & SubscriptionNote;
    try {
      body = JSON.parse(String(event.data)) as JsonRpcSuccess & SubscriptionNote;
    } catch {
      return;
    }
    if (body.method === 'eth_subscription') {
      dispatchSubscriptionListener(listeners, body.params?.subscription, body.params?.result);
      return;
    }
    if (typeof body.id !== 'number') return;
    const waiter = pending.get(body.id);
    if (!waiter) return;
    pending.delete(body.id);
    if (body.error?.message) waiter.reject(new Error(body.error.message));
    else waiter.resolve(body.result);
  });

  ws.addEventListener('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('WebSocket closed'));
    pending.clear();
    onClose?.();
  });

  const request = async (method: string, params: unknown[]): Promise<unknown> => {
    await ready;
    if (ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket closed');
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error('WebSocket send failed'));
      }
    });
  };

  const subscribe = async (params: unknown[], onResult: (result: unknown) => void): Promise<() => void> => {
    const subId = await request('eth_subscribe', params);
    if (typeof subId !== 'string') throw new Error('eth_subscribe returned no id');
    listeners.set(subId, onResult);
    return () => {
      listeners.delete(subId);
      if (ws.readyState === WebSocket.OPEN) {
        void request('eth_unsubscribe', [subId]).catch(() => {});
      }
    };
  };

  return {
    ready,
    request,
    subscribe,
    setOnClose: (handler: () => void) => {
      onClose = handler;
    },
    close: () => {
      onClose = undefined;
      listeners.clear();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    },
  };
}

export function headNumber(head: StreamHead): bigint | null {
  try {
    return BigInt(head.number);
  } catch {
    return null;
  }
}
