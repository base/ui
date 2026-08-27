// Server-only config for the validity demo's RPC proxy.
// Defaults to the public Vibenet RPC; override with VALIDITY_DEMO_* in `.env.local`.

import { VIBENET_RPC_URL } from '../../../vibenet/library/config';

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function getReadRpcUrl(): string {
  return trimEnv('VALIDITY_DEMO_RPC_URL') ?? VIBENET_RPC_URL;
}

export function getSubmitRpcUrl(): string {
  return trimEnv('VALIDITY_DEMO_SUBMIT_RPC_URL') ?? getReadRpcUrl();
}

export function rpcHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-rpc-url';
  }
}

export const SUBMIT_METHODS = new Set([
  'eth_sendRawTransaction',
  'eth_sendRawTransactionSync',
  'base_sendRawTransactionValidity',
]);

export const ALLOWED_METHODS = new Set([
  ...SUBMIT_METHODS,
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getCode',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_getStorageAt',
  'eth_getLogs',
  'eth_blobBaseFee',
]);
