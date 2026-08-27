// Pure, dependency-free formatters for the Basescan-style explorer surfaces
// (blocks / txs / txn detail). Client-safe: no env, no server imports — usable
// from both the server list modules and client components.

import type { ShadowBlockSummary } from './types';

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

export function formatSignedInteger(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`;
}

export function formatSignedPct(value: number): string {
  const rounded = Number(value.toFixed(1));
  const clamped = Object.is(rounded, -0) ? 0 : rounded;
  return `${clamped > 0 ? '+' : ''}${clamped.toFixed(1)}%`;
}

function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  const trimmed = value.replace(/0+$/, '');
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
}

export function formatSignedGas(value: number): string {
  if (value === 0) return '0';
  const sign = value > 0 ? '+' : '-';
  const absValue = Math.abs(value);

  if (absValue < 1_000) {
    const rounded = Math.round(absValue);
    return rounded === 0 ? '0' : `${sign}${rounded}`;
  }

  if (absValue < 1_000_000) {
    const rounded = Number((absValue / 1_000).toFixed(1));
    if (rounded >= 1000) {
      const formatted = trimTrailingZeros((absValue / 1_000_000).toFixed(2));
      return `${sign}${formatted}M`;
    }
    const formatted = trimTrailingZeros(rounded.toFixed(1));
    return `${sign}${formatted}K`;
  }

  if (absValue < 1_000_000_000) {
    const rounded = Number((absValue / 1_000_000).toFixed(2));
    if (rounded >= 1000) {
      const formatted = trimTrailingZeros((absValue / 1_000_000_000).toFixed(2));
      return `${sign}${formatted}B`;
    }
    const formatted = trimTrailingZeros(rounded.toFixed(2));
    return `${sign}${formatted}M`;
  }

  const formatted = trimTrailingZeros((absValue / 1_000_000_000).toFixed(2));
  return `${sign}${formatted}B`;
}

function toNumber(value: NumericValue): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') {
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    if (value > maxSafe || value < -maxSafe) return null;
    return Number(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateShadowDelta(
  canonicalGasUsed: NumericValue,
  canonicalTxCount: NumericValue,
  shadow: ShadowBlockSummary,
): {
  gasDiffAbs: number;
  gasDiffPct?: number;
  txDiffAbs: number;
  txDiffPct?: number;
} | null {
  const canonicalGas = toNumber(canonicalGasUsed);
  const canonicalTx = toNumber(canonicalTxCount);
  const shadowGas = toNumber(shadow.gasUsed);
  const shadowTx = toNumber(shadow.txCount);

  if (canonicalGas === null || canonicalTx === null || shadowGas === null || shadowTx === null) {
    return null;
  }

  const gasDiffAbs = shadowGas - canonicalGas;
  const gasDiffPct = canonicalGas > 0 ? (gasDiffAbs / canonicalGas) * 100 : undefined;
  const txDiffAbs = shadowTx - canonicalTx;
  const txDiffPct = canonicalTx > 0 ? (txDiffAbs / canonicalTx) * 100 : undefined;

  return { gasDiffAbs, gasDiffPct, txDiffAbs, txDiffPct };
}

export function formatEth(value: NumericValue): string {
  const formatted = formatUnits(value, WEI_PER_ETH, 6);
  return formatted === '—' ? formatted : `${formatted} ETH`;
}

export function formatGwei(value: NumericValue): string {
  const formatted = formatUnits(value, WEI_PER_GWEI, 9);
  return formatted === '—' ? formatted : `${formatted} Gwei`;
}

export function formatLatency(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)} s`;
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
