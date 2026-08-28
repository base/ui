import { nonceKeyMax } from '@aa';

import { MAX_NONCELESS_SECONDS } from './constants';

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
