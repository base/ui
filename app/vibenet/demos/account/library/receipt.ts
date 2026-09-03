import { allPhasesSucceeded, type Hex } from '@aa';

export type AaReceiptLike = {
  status?: 'success' | 'reverted' | Hex;
  eip8130?: { phaseStatuses?: readonly Hex[] };
};

/** An EIP-8130 transaction succeeds only when its outer tx and every call phase succeed. */
export function aaReceiptSucceeded(receipt: AaReceiptLike): boolean {
  if (receipt.status === 'reverted' || receipt.status === '0x0') return false;
  return allPhasesSucceeded(receipt.eip8130 ?? {});
}
