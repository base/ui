import { NextResponse } from 'next/server';

import { getReadRpcUrl, getSubmitRpcUrl, getWsRpcUrl, rpcHost } from '../config';
import { forwardJsonRpc } from '../forward';

type JsonRpcResponse = {
  result?: unknown;
  error?: { code?: number; message?: string };
};

async function rpcCall(method: string, params: unknown[]): Promise<JsonRpcResponse> {
  const body = await forwardJsonRpc({ jsonrpc: '2.0', id: 1, method, params });
  return (body ?? {}) as JsonRpcResponse;
}

function methodExists(response: JsonRpcResponse): boolean {
  const code = response.error?.code;
  const message = (response.error?.message ?? '').toLowerCase();
  if (code === -32601) return false;
  if (message.includes('method not found') || message.includes('method is not available')) {
    return false;
  }
  if (message.includes('unsupported') && message.includes('method')) return false;
  return true;
}

function typeAccepted(response: JsonRpcResponse): boolean {
  const message = (response.error?.message ?? '').toLowerCase();
  if (!response.error) return true;
  if (message.includes('unknown variant') || message.includes('unknown type') || message.includes('invalid type')) {
    return false;
  }
  if (message.includes('deny_unknown') || message.includes('did not match any variant')) return false;
  return true;
}

const DUMMY_TX = '0x00';
const DUMMY_BALANCE = {
  type: 'balance',
  params: {
    address: '0x0000000000000000000000000000000000000001',
    op: '>=',
    value: '0x0',
  },
};
const DUMMY_BLOCK = {
  type: 'block_number',
  params: { op: '<=', value: '0x1' },
};

export async function GET() {
  const readHost = rpcHost(getReadRpcUrl());
  const submitHost = rpcHost(getSubmitRpcUrl());

  const chain = await rpcCall('eth_chainId', []);
  const genesis = await rpcCall('eth_getBlockByNumber', ['0x0', false]);
  const validity = await rpcCall('base_sendRawTransactionValidity', [
    { tx: DUMMY_TX, validity: [DUMMY_BALANCE] },
  ]);
  const validitySupported = methodExists(validity);
  let blockNumberPredicate = false;
  if (validitySupported) {
    const blockProbe = await rpcCall('base_sendRawTransactionValidity', [
      { tx: DUMMY_TX, validity: [DUMMY_BLOCK] },
    ]);
    blockNumberPredicate = typeAccepted(blockProbe);
  }

  const genesisHash =
    genesis.result && typeof genesis.result === 'object' && genesis.result !== null && 'hash' in genesis.result
      ? String((genesis.result as { hash: unknown }).hash)
      : null;

  return NextResponse.json({
    chainId: typeof chain.result === 'string' ? Number.parseInt(chain.result, 16) : null,
    genesisHash,
    readHost,
    submitHost,
    wsUrl: getWsRpcUrl(),
    validitySupported,
    blockNumberPredicate,
    validityError: validity.error?.message ?? null,
  });
}
