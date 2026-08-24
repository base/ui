// Memoized viem public clients for Internal Explorer execution-RPC reads. Chain-aware:
// callers pass the resolved rpcUrl (getRpcUrl(chain)) and get a client bound to
// that endpoint, so one deployment can serve all chains. Server-only.
//
// A chain is intentionally not set — these are raw reads (getBlock / getTransaction
// / getTransactionReceipt / getBlockNumber) that don't need chain-specific config,
// and the endpoint may serve mainnet, sepolia, or zeronet.
import { createPublicClient, http } from 'viem';

const clients = new Map<string, ReturnType<typeof createPublicClient>>();

export function publicClientFor(rpcUrl: string) {
  const existing = clients.get(rpcUrl);
  if (existing) {
    return existing;
  }

  const client = createPublicClient({ transport: http(rpcUrl) });
  clients.set(rpcUrl, client);
  return client;
}

export type TipsPublicClient = ReturnType<typeof publicClientFor>;
