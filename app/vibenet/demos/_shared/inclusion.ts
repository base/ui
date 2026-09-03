// Inclusion timing for a broadcast transaction. Base's Denim upgrade (200 ms
// blocks) adds a millisecond `timestampMs` to every block, so a transaction can
// say which 200 ms slot it landed in, not just which second. Vibenet runs
// Denim today; on chains without it `blockTimestampMs` is null and only the
// wall-clock latency is shown.

export type Inclusion = {
  /** Block the transaction was included in. */
  blockNumber: number;
  /** Block time in unix milliseconds from the Denim `timestampMs` field, or null pre-Denim. */
  blockTimestampMs: number | null;
  /**
   * Milliseconds from broadcast to inclusion. With Denim metadata this is the
   * block's own millisecond timestamp minus the send time — the chain's latency,
   * not the client's polling. Without it, it falls back to when the receipt was
   * observed.
   */
  inclusionMs: number;
};

/** Parse a JSON-RPC quantity (`0x…`) to a number; null when absent or malformed. */
export function quantityToNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Build an Inclusion from the raw block a receipt landed in. */
export function inclusionFromBlock(
  block: { number?: unknown; timestampMs?: unknown } | null | undefined,
  submittedAt: number,
  observedAt: number,
): Inclusion | null {
  const blockNumber = quantityToNumber(block?.number);
  if (blockNumber === null) return null;
  const blockTimestampMs = quantityToNumber(block?.timestampMs);
  // Prefer the block's own clock: receipt polling adds round trips that would
  // otherwise be charged to the chain. Clamped, since the two clocks can skew.
  const landedAt = blockTimestampMs ?? observedAt;
  return {
    blockNumber,
    blockTimestampMs,
    inclusionMs: Math.max(0, landedAt - submittedAt),
  };
}

/** The 200 ms slot inside the second: `.000`, `.200`, … or null without Denim metadata. */
export function slotLabel(blockTimestampMs: number | null): string | null {
  if (blockTimestampMs === null) return null;
  return `.${String(blockTimestampMs % 1000).padStart(3, '0')}`;
}

/** Latency for display: `412 ms` under a second, `1.8 s` above. */
export function latencyLabel(inclusionMs: number): string {
  if (inclusionMs < 1000) return `${Math.round(inclusionMs)} ms`;
  return `${(inclusionMs / 1000).toFixed(1)} s`;
}

/** One-line summary: `Landed in 412 ms · block 136,522 · .200`. */
export function formatInclusion(inclusion: Inclusion): string {
  const parts = [`Landed in ${latencyLabel(inclusion.inclusionMs)}`, `block ${inclusion.blockNumber.toLocaleString()}`];
  const slot = slotLabel(inclusion.blockTimestampMs);
  if (slot) parts.push(slot);
  return parts.join(' · ');
}
