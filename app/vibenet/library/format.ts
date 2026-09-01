// Formatting + validation helpers for the Vibenet section. Kept dependency-free
// so both server and client modules (landing, explorer, vibes) can share them.

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** True for a 20-byte hex address string. */
export function isAddress(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS_RE.test(value);
}

/** Abbreviate a hash/address as `0x1234…abcd`. Missing values render as an em dash. */
export function shortAddress(
  value: string | null | undefined,
  lead = 6,
  tail = 4,
): string {
  if (!value) return '—';
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/** Fallback label for an unknown contract key, e.g. `usdvToken` -> `Usdv Token`. */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Format a raw integer-string token amount (e.g. wei) as a human decimal.
 * Pure BigInt arithmetic so precision holds for values above 2^53 (converting
 * to Number first silently drops low-order digits past that threshold).
 */
export function formatAmount(raw: string, decimals: number, maxFractionDigits = 4): string {
  try {
    const value = BigInt(raw);
    if (value === 0n) return '0';
    const divisor = 10n ** BigInt(decimals);
    const whole = (value / divisor).toLocaleString();
    const frac = (value % divisor)
      .toString()
      .padStart(decimals, '0')
      .slice(0, maxFractionDigits)
      .replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole;
  } catch {
    return raw;
  }
}
