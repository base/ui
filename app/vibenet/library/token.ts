// Best-effort on-chain ERC-20 metadata lookup for the explorer. The tx
// receipt has no symbol/decimals for an arbitrary token (the b20 demo lets
// users deploy their own), so resolving a display name means reading the
// contract directly.

import { createPublicClient, http, type Address as ViemAddress } from 'viem';

import { VIBENET_RPC_URL } from './config';

const ERC20_METADATA_ABI = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

const client = createPublicClient({ transport: http(VIBENET_RPC_URL) });

export type TokenMeta = { symbol: string; decimals: number };

/** Reads `symbol()`/`decimals()`; null if the address isn't a readable ERC-20. */
export async function fetchTokenMeta(address: string): Promise<TokenMeta | null> {
  try {
    const addr = address as ViemAddress;
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: addr, abi: ERC20_METADATA_ABI, functionName: 'symbol' }),
      client.readContract({ address: addr, abi: ERC20_METADATA_ABI, functionName: 'decimals' }),
    ]);
    return { symbol, decimals };
  } catch {
    return null;
  }
}
