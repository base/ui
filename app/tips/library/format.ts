// Pure formatting helpers for the TIPS surface (formatHexValue / formatGasPrice /
// time-ago) so the pages stay presentational. Dependency-free — safe to import
// from server or client.

const WEI_PER_GWEI = 10n ** 9n;
const WEI_PER_ETH = 10n ** 18n;

function formatBigInt(value: bigint, decimals: number, scale: bigint): string {
  const whole = value / scale;
  const frac = ((value % scale) * 10n ** BigInt(decimals)) / scale;
  return `${whole}.${frac.toString().padStart(decimals, '0')}`;
}

/** Render a `0x…` wei quantity as ETH / Gwei / Wei depending on magnitude. */
export function formatHexValue(hex: string | undefined): string {
  if (!hex) return '—';
  const value = BigInt(hex);
  if (value >= WEI_PER_ETH / 10000n) {
    return `${formatBigInt(value, 6, WEI_PER_ETH)} ETH`;
  }
  if (value >= WEI_PER_GWEI / 100n) {
    return `${formatBigInt(value, 4, WEI_PER_GWEI)} Gwei`;
  }
  return `${value.toString()} Wei`;
}

/** Render a `0x…` wei gas price as Gwei. */
export function formatGasPrice(hex: string | undefined): string {
  if (!hex) return '—';
  const value = BigInt(hex);
  return `${formatBigInt(value, 2, WEI_PER_GWEI)} Gwei`;
}

/** Compact "Ns / Nm / Nh / Nd ago" from a unix-seconds timestamp. */
export function timeAgoFromSeconds(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** `0x1234…abcd` abbreviation for a hash/address. */
export function shortHash(value: string, lead = 10, tail = 8): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
