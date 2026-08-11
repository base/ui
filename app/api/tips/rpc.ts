// Raw JSON-RPC helpers for TIPS execution-RPC reads. Omni has no viem dependency
// (see app/api/tips/block/[hash]/route.ts), so chain data is fetched with
// fetch() + JSON-RPC. Every function takes an explicit rpcUrl so callers stay
// chain-aware — resolve it with getRpcUrl(chain) from config.ts. Server-only.

interface JsonRpcResult {
  result?: unknown;
  error?: { message?: string };
}

/** Single JSON-RPC call. Returns the raw `result`, or null on any error. */
export async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as JsonRpcResult;
    return data.error || data.result === undefined ? null : data.result;
  } catch {
    return null;
  }
}

/** Batched JSON-RPC call. Returns the raw response array, or [] on any error. */
export async function rpcBatch(
  rpcUrl: string,
  requests: Array<{ method: string; params: unknown[] }>,
): Promise<Array<{ id: number; result?: unknown; error?: unknown }>> {
  if (requests.length === 0) return [];
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        requests.map((request, index) => ({
          jsonrpc: '2.0',
          method: request.method,
          params: request.params,
          id: index + 1,
        })),
      ),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Parse a JSON-RPC quantity (hex string) to bigint, or null. */
export function hexToBigInt(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** Parse a JSON-RPC quantity to a safe integer, or null. */
export function hexToNumber(value: unknown): number | null {
  const parsed = hexToBigInt(value);
  if (parsed === null) return null;
  const asNumber = Number(parsed);
  return Number.isSafeInteger(asNumber) ? asNumber : null;
}

/** Parse a JSON-RPC quantity to its decimal-string form, or null. */
export function decimalQuantity(value: unknown): string | null {
  const parsed = hexToBigInt(value);
  return parsed === null ? null : parsed.toString();
}

/** Encode a block number as a JSON-RPC block tag (0x-prefixed hex). */
export function toBlockTag(blockNumber: number | bigint): string {
  return `0x${BigInt(blockNumber).toString(16)}`;
}
