import {
  createPublicClient,
  createWalletClient,
  custom,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';

import { CANDLES_PATH, RPC_PATH, STATUS_PATH } from './constants';
import { parseTapeSamples, type TapeSample } from './tape';
import type { ChainStatus, ValidityPredicate } from './types';

export type RpcSend = (method: string, params: unknown[]) => Promise<unknown>;

const WRITE_METHODS = new Set([
  'eth_sendRawTransaction',
  'eth_sendRawTransactionSync',
  'base_sendRawTransactionValidity',
]);

async function proxyRpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(RPC_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error?.message) throw new Error(body.error.message);
  return body.result;
}

function eip1193(getSend?: () => RpcSend | null) {
  return {
    request: async ({ method, params }: { method: string; params?: unknown }) => {
      const args = Array.isArray(params) ? params : [];
      if (!WRITE_METHODS.has(method)) {
        const send = getSend?.();
        if (send) return send(method, args);
      }
      return proxyRpc(method, args);
    },
  };
}

export function chainFromId(id: number): Chain {
  const name =
    id === 84538453 ? 'Vibenet' : id === 763360 ? 'Base Zeronet' : id === 1337 ? 'Local devnet' : `Chain ${id}`;
  return {
    id,
    name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_PATH] } },
  };
}

export function makePublicClient(chain: Chain, getSend?: () => RpcSend | null): PublicClient {
  return createPublicClient({ chain, transport: custom(eip1193(getSend)), cacheTime: 0 });
}

export function makeWalletClient(chain: Chain, account: Account): WalletClient {
  return createWalletClient({ chain, account, transport: custom(eip1193()) });
}

export async function fetchTape(pair: Address, vibeToken0: boolean): Promise<TapeSample[]> {
  const response = await fetch(
    `${CANDLES_PATH}?pair=${pair}&vibeToken0=${vibeToken0 ? '1' : '0'}`,
    { cache: 'no-store' },
  );
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as { samples?: unknown } | null;
  return parseTapeSamples(body?.samples);
}

export async function publishTape(pair: Address, samples: readonly TapeSample[]): Promise<void> {
  if (samples.length === 0) return;
  await fetch(CANDLES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pair, samples }),
    keepalive: true,
  });
}

export async function fetchChainStatus(): Promise<ChainStatus> {
  const response = await fetch(STATUS_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Status ${response.status}`);
  }
  return (await response.json()) as ChainStatus;
}

export function describeValidityError(err: unknown): string {
  const record = err as {
    shortMessage?: string;
    details?: string;
    message?: string;
    cause?: { shortMessage?: string; details?: string; message?: string };
  };
  const message = err instanceof Error ? err.message : String(err);
  if (/does not exist|not available|Method not found/i.test(message)) {
    return 'This node does not expose base_sendRawTransactionValidity. Vibenet must have --enable-experimental-validity-transactions.';
  }
  const short = record.shortMessage?.trim();
  const generic = Boolean(short && /^Missing or invalid parameters/i.test(short));
  const details =
    (generic ? record.details : undefined) ??
    record.details ??
    short ??
    record.cause?.details ??
    record.cause?.shortMessage ??
    record.cause?.message;
  if (details && !/^Missing or invalid parameters/i.test(details)) {
    const line = details.split('\n')[0]?.trim() || details;
    return line.length > 240 ? `${line.slice(0, 237)}…` : line;
  }
  const detailLine = message.match(/Details:\s*(.+)/i)?.[1]?.trim();
  if (detailLine) return detailLine.length > 240 ? `${detailLine.slice(0, 237)}…` : detailLine;
  const first = message.split('\n')[0]?.trim() || 'Submit failed';
  return first.length > 240 ? `${first.slice(0, 237)}…` : first;
}

export async function sendValidityTransaction(
  tx: Hex,
  validity: ValidityPredicate[],
): Promise<Hex> {
  const result = await proxyRpc('base_sendRawTransactionValidity', [{ tx, validity }]);
  if (typeof result === 'string' && result.startsWith('0x')) return result as Hex;
  throw new Error('Validity submit returned no hash.');
}
