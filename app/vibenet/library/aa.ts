import { nonceKeyMax } from '@aa';

/**
 * EIP-8130 nonce-free (`nonceKeyMax`) txs are capped at a 20s `validBefore`.
 */
export const MAX_NONCELESS_SECONDS = 20;

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
