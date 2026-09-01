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

import { VIBENET_RPC_URL, VIBENET_WS_URL } from '../../../library/config';
import { VIBENET } from '../../account/library/chains';
import { CANDLES_PATH } from './constants';
import { parseTapeSamples, type TapeSample } from './tape';
import type { ValidityPredicate } from './types';

export type RpcSend = (method: string, params: unknown[]) => Promise<unknown>;

const WRITE_METHODS = new Set([
  'eth_sendRawTransaction',
  'eth_sendRawTransactionSync',
  'base_sendRawTransactionValidity',
]);

export const VIBENET_CHAIN: Chain = {
  id: VIBENET.id,
  name: VIBENET.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [VIBENET_RPC_URL],
      ...(VIBENET_WS_URL ? { webSocket: [VIBENET_WS_URL] } : {}),
    },
  },
};

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(VIBENET_RPC_URL, {
    method: 'POST',
    cache: 'no-store',
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
      return rpcCall(method, args);
    },
  };
}

export function makePublicClient(getSend?: () => RpcSend | null): PublicClient {
  return createPublicClient({ chain: VIBENET_CHAIN, transport: custom(eip1193(getSend)), cacheTime: 0 });
}

export function makeWalletClient(account: Account): WalletClient {
  return createWalletClient({ chain: VIBENET_CHAIN, account, transport: custom(eip1193()) });
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

export function describeValidityError(err: unknown): string {
  const record = err as {
    shortMessage?: string;
    details?: string;
    message?: string;
    cause?: { shortMessage?: string; details?: string; message?: string };
  };
  const message = err instanceof Error ? err.message : String(err);
  if (/does not exist|not available|Method not found/i.test(message)) {
    return 'This node does not expose base_sendRawTransactionValidity.';
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
  const result = await rpcCall('base_sendRawTransactionValidity', [{ tx, validity }]);
  if (typeof result === 'string' && result.startsWith('0x')) return result as Hex;
  throw new Error('Validity submit returned no hash.');
}
