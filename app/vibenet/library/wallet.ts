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

// EIP-1193 error code, unwrapping the common `cause` nesting some wallets use.
function walletErrorCode(err: unknown): number | undefined {
  const e = err as { code?: number; cause?: { code?: number } };
  return e?.code ?? e?.cause?.code;
}

/** EIP-1193 4001: the user dismissed/rejected the wallet prompt. */
export function isUserRejection(err: unknown): boolean {
  return walletErrorCode(err) === 4001;
}

/** EIP-3326 4902: the chain isn't added to the wallet yet (switch → add fallback). */
export function isUnrecognizedChain(err: unknown): boolean {
  return walletErrorCode(err) === 4902;
}

/** Current wallet chain id as a number, or null if it can't be read. */
export async function getChainId(provider: EthereumProvider): Promise<number | null> {
  try {
    const hex = (await provider.request({ method: 'eth_chainId' })) as string;
    const n = Number.parseInt(hex, 16);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export type AddChainParams = {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
};

// EIP-3326: switch to an already-added chain. Throws 4902 if not added, 4001 if
// the user dismisses the prompt.
export async function switchEthereumChain(
  provider: EthereumProvider,
  chainId: number,
): Promise<void> {
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: `0x${chainId.toString(16)}` }],
  });
}

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
