export type FeeFields = {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

/** Geth/OP mempools require ≥10% higher tip and fee cap to replace. 12.5% + 1 wei. */
const BUMP_NUM = 9n;
const BUMP_DEN = 8n;

function bump(value: bigint): bigint {
  return (value * BUMP_NUM) / BUMP_DEN + 1n;
}

export function bumpReplacementFees(previous: FeeFields, latest?: FeeFields | null): FeeFields {
  const tipFloor = bump(previous.maxPriorityFeePerGas);
  const maxFloor = bump(previous.maxFeePerGas);
  const maxPriorityFeePerGas =
    latest && latest.maxPriorityFeePerGas > tipFloor ? latest.maxPriorityFeePerGas : tipFloor;
  let maxFeePerGas = latest && latest.maxFeePerGas > maxFloor ? latest.maxFeePerGas : maxFloor;
  if (maxFeePerGas < maxPriorityFeePerGas) maxFeePerGas = maxPriorityFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

export function isReplacementUnderpriced(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /replacement transaction underpriced|underpriced replacement/i.test(message);
}

export function padFees(fees: FeeFields, mul = 3n): FeeFields {
  return {
    maxFeePerGas: fees.maxFeePerGas * mul,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas * mul,
  };
}

/** Tip + 2× base fee from a `newHeads` payload so submit skips `eth_getBlockByNumber`. */
export function feesFromHead(head: { baseFeePerGas?: string | null }): FeeFields | null {
  if (!head.baseFeePerGas) return null;
  try {
    const base = BigInt(head.baseFeePerGas);
    const maxPriorityFeePerGas = 1_000_000n;
    return {
      maxFeePerGas: (base === 0n ? 1_000_000_000n : base * 2n) + maxPriorityFeePerGas,
      maxPriorityFeePerGas,
    };
  } catch {
    return null;
  }
}
