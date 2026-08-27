import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';

import { RPC_PATH, STATUS_PATH } from './constants';
import type { ChainStatus, ValidityPredicate } from './types';

export const PROXY_TRANSPORT = http(RPC_PATH);

export function chainFromId(id: number): Chain {
  const name =
    id === 84538453 ? 'Vibenet' : id === 763360 ? 'Base Zeronet' : id === 1337 ? 'Local devnet' : `Chain ${id}`;
  return {
    id,
    name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [typeof window === 'undefined' ? 'http://127.0.0.1:8545' : RPC_PATH] } },
  };
}

export function makePublicClient(chain: Chain): PublicClient {
  return createPublicClient({ chain, transport: PROXY_TRANSPORT, cacheTime: 0 });
}

export function makeWalletClient(chain: Chain, account: Account): WalletClient {
  return createWalletClient({ chain, account, transport: PROXY_TRANSPORT });
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
  _client: PublicClient,
  tx: Hex,
  validity: ValidityPredicate[],
): Promise<Hex> {
  const response = await fetch(RPC_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'base_sendRawTransactionValidity',
      params: [{ tx, validity }],
    }),
  });
  const body = (await response.json()) as { result?: Hex; error?: { message?: string } };
  if (body.error?.message) throw new Error(body.error.message);
  if (!body.result) throw new Error('Validity submit returned no hash.');
  return body.result;
}
