import {
  defaultAccountAddress,
  encodeWalletCalls,
  nonceFreeMaxExpiryWindow,
  nonceKeyMax,
  privateKeyToAccount,
  toEoaAccount,
  type Hex,
} from '@aa';
import type { Address, PublicClient } from 'viem';

import { MAX_NONCELESS_SECONDS } from './constants';
import type { FeeFields } from './fees';

export function clampNoncelessExpiry(seconds: number): number {
  return Math.min(Math.max(1, seconds), MAX_NONCELESS_SECONDS);
}

export function noncelessFields(expiresIn: number, now = Date.now()) {
  const seconds = clampNoncelessExpiry(expiresIn);
  return {
    nonceKey: nonceKeyMax,
    nonceSequence: 0n,
    validBefore: BigInt(now + seconds * 1000),
  };
}

const FALLBACK_FEES = {
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 1_000_000n,
} as const;

/** Sign the helper swap as an EIP-8130 nonceless tx from the demo EOA. */
export async function signNoncelessCall(args: {
  privateKey: Hex;
  chainId: number;
  to: Address;
  data: Hex;
  expiresIn: number;
  fees?: FeeFields | null;
  publicClient: PublicClient;
}): Promise<{ signed: Hex; validBefore: bigint }> {
  const signer = privateKeyToAccount(args.privateKey);
  const account = toEoaAccount(signer);
  const code = await args.publicClient.getCode({ address: account.address });
  const accountChanges = !code || code === '0x' ? [account.delegate(defaultAccountAddress)] : [];
  const calls = encodeWalletCalls({
    account: account.address,
    calls: [[{ to: args.to, data: args.data, value: 0n }]],
  });
  const fields = noncelessFields(args.expiresIn);
  const signed = await account.signTransaction({
    chainId: args.chainId,
    accountChanges,
    calls,
    ...fields,
    gas: accountChanges.length > 0 ? 800_000n : 400_000n,
    ...(args.fees ?? FALLBACK_FEES),
  });
  return { signed, validBefore: fields.validBefore };
}

export const NONCELESS_WINDOW_MS = Number(nonceFreeMaxExpiryWindow);
