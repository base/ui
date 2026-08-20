// Pure, dependency-free formatters for the Shadow Explorer surfaces. Client-safe:
// no env, no server imports.

export type NumericValue = bigint | number | string | null | undefined;

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

export function formatInteger(value: NumericValue): string {
  const parsed = toBigInt(value);
  return parsed === null ? '—' : parsed.toLocaleString();
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
