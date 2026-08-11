// Pure, dependency-free formatters for the Basescan-style explorer surfaces
// (blocks / txs / txn detail). Ported from tips-ui src/lib/explorer-format.ts.
// Client-safe: no env, no server imports — usable from both the server list
// modules and client components.

export type NumericValue = bigint | number | string | null | undefined;

const WEI_PER_GWEI = 10n ** 9n;
const WEI_PER_ETH = 10n ** 18n;

function toBigInt(value: NumericValue): bigint | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? BigInt(value) : null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function formatUnits(value: NumericValue, scale: bigint, decimals: number): string {
  const parsed = toBigInt(value);
  if (parsed === null) return '—';

  const whole = parsed / scale;
  const fraction = ((parsed % scale) * 10n ** BigInt(decimals)) / scale;
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');

  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

export function formatInteger(value: NumericValue): string {
  const parsed = toBigInt(value);
  return parsed === null ? '—' : parsed.toLocaleString();
}

export function formatEth(value: NumericValue): string {
  const formatted = formatUnits(value, WEI_PER_ETH, 6);
  return formatted === '—' ? formatted : `${formatted} ETH`;
}

export function formatGwei(value: NumericValue): string {
  const formatted = formatUnits(value, WEI_PER_GWEI, 9);
  return formatted === '—' ? formatted : `${formatted} Gwei`;
}

export function formatAge(
  timestamp: NumericValue,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const parsed = toBigInt(timestamp);
  if (parsed === null) return '—';

  const seconds = Math.max(0, nowSeconds - Number(parsed));
  if (seconds < 60) return seconds <= 0 ? 'now' : `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function shortHash(value: string, prefix = 10, suffix = 8): string {
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

export function shortAddress(value: string | null | undefined): string {
  if (!value) return '—';
  return shortHash(value, 6, 4);
}

export function formatAction(
  input: string | null | undefined,
  to: string | null | undefined,
): string {
  if (!to) return 'Contract Creation';
  if (!input || input === '0x') return 'Transfer';
  if (/^0x[0-9a-f]{8}/i.test(input)) return input.slice(0, 10);
  return 'Contract Call';
}

export function weiToBigInt(value: NumericValue): bigint | null {
  return toBigInt(value);
}

export function calculateTransactionFee(
  gasUsed: NumericValue,
  effectiveGasPrice: NumericValue,
): bigint | null {
  const parsedGasUsed = toBigInt(gasUsed);
  const parsedEffectiveGasPrice = toBigInt(effectiveGasPrice);
  if (parsedGasUsed === null || parsedEffectiveGasPrice === null) {
    return null;
  }
  return parsedGasUsed * parsedEffectiveGasPrice;
}
