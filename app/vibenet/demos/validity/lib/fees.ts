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

export function isNonceTooLow(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /nonce too low/i.test(message);
}

export function isInsufficientFunds(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /insufficient funds|insufficient balance|exceeds the balance/i.test(message);
}

export function padFees(fees: FeeFields, mul = 3n): FeeFields {
  return {
    maxFeePerGas: fees.maxFeePerGas * mul,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas * mul,
  };
}
