import { ALLOWED_METHODS, SUBMIT_METHODS, getReadRpcUrl, getSubmitRpcUrl } from './config';

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
};

type JsonRpcError = { code: number; message: string };

function methodNotAllowed(id: unknown, method: string) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code: -32601, message: `Method not allowed: ${method}` } satisfies JsonRpcError,
  };
}

async function forwardOne(request: JsonRpcRequest): Promise<unknown> {
  const method = request.method ?? '';
  if (!ALLOWED_METHODS.has(method)) {
    return methodNotAllowed(request.id, method);
  }
  const url = SUBMIT_METHODS.has(method) ? getSubmitRpcUrl() : getReadRpcUrl();
  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: request.jsonrpc ?? '2.0',
      id: request.id ?? 1,
      method,
      params: request.params ?? [],
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      error: {
        code: -32603,
        message: `Upstream RPC HTTP ${response.status}`,
      },
    };
  }
  return body;
}

export async function forwardJsonRpc(payload: unknown): Promise<unknown> {
  if (Array.isArray(payload)) {
    return Promise.all(payload.map((item) => forwardOne(item as JsonRpcRequest)));
  }
  return forwardOne(payload as JsonRpcRequest);
}
