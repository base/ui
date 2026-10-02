// ERC-8168 token-offer math for the vibenet payer. A token offer's binding
// price is a WAD `rate` (token atomic units per 1e18 wei); the phase-0 transfer
// must cover ceil(gasLimit * maxFeePerGas * rate / 1e18) at the gas and fee the
// transaction is actually signed with, not only the quote's `gasEstimate`.

const WAD = 10n ** 18n;

/**
 * Read a token choice's `rate` as a WAD bigint. Accepts the current hex
 * quantity and the older `{ numerator, denominator }` (units per `denominator`
 * wei) shape. `null` when absent or malformed.
 */
export function parseTokenRate(rate: unknown): bigint | null {
  try {
    if (typeof rate === 'string') return BigInt(rate);
    if (rate && typeof rate === 'object') {
      const { numerator, denominator } = rate as { numerator?: unknown; denominator?: unknown };
      if (typeof numerator !== 'string' || typeof denominator !== 'string') return null;
      const d = BigInt(denominator);
      return d === 0n ? null : (BigInt(numerator) * WAD) / d;
    }
  } catch {
    return null;
  }
  return null;
}

/** `mulDivUp(gasLimit * maxFeePerGas, rate, 1e18)`. */
export function requiredTokenAmount(gasLimit: bigint, maxFeePerGas: bigint, rate: bigint): bigint {
  const cost = gasLimit * maxFeePerGas;
  if (cost === 0n || rate === 0n) return 0n;
  return (cost * rate + WAD - 1n) / WAD;
}
