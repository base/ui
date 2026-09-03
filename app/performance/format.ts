function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  const trimmed = value.replace(/0+$/, '');
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
}

/**
 * Compact unsigned TPS for the in-page sidebar: 1,120 → "1.1k",
 * 2,490,000 → "2.5M". Trailing `.0` is dropped so 1,000 is "1k".
 */
export function formatCompactTps(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);

  if (abs < 1_000) {
    return String(Math.round(abs));
  }
  if (abs < 1_000_000) {
    return `${trimTrailingZeros((abs / 1_000).toFixed(1))}k`;
  }
  if (abs < 1_000_000_000) {
    return `${trimTrailingZeros((abs / 1_000_000).toFixed(1))}M`;
  }
  return `${trimTrailingZeros((abs / 1_000_000_000).toFixed(1))}B`;
}

/** Full TPS for the main metric cards: 1,120 → "1,120 TPS". */
export function formatFullTps(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} TPS`;
}
