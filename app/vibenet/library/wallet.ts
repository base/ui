// Minimal EIP-1193 wallet helpers, kept out of the components so the landing
// page (and future wallet-driven views) don't repeat provider plumbing. No
// `viem` dependency — these are the raw JSON-RPC wallet methods.

import type { WatchableToken } from './types';

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

/** The injected provider, or undefined when no browser wallet is present. */
export function getEthereum(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

/** Best-effort human-readable message from a rejected wallet request. */
export function walletErrorMessage(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string };
  return e.shortMessage ?? e.message ?? String(err);
}

export type AddChainParams = {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
};

// EIP-3085: prompt the wallet to add (and switch to) the chain.
export async function addEthereumChain(
  provider: EthereumProvider,
  params: AddChainParams,
): Promise<void> {
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: `0x${params.chainId.toString(16)}`,
        chainName: params.chainName,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: [params.rpcUrl],
        blockExplorerUrls: [params.explorerUrl],
      },
    ],
  });
}

// EIP-747: prompt the wallet to track a token.
export async function watchAsset(
  provider: EthereumProvider,
  token: WatchableToken & { address: string },
): Promise<void> {
  await provider.request({
    method: 'wallet_watchAsset',
    params: {
      type: token.type,
      options: { address: token.address, symbol: token.symbol, decimals: token.decimals },
    },
  });
}
