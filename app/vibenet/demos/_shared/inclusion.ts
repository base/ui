// Inclusion timing for a broadcast transaction, measured on the chain's clock
// only. Base's Cobalt upgrade (200 ms blocks) stamps every block with a
// millisecond `timestampMs`, so a transaction can say which 200 ms slot it
// landed in and how many blocks after broadcast that was. The latency shown is
// the inclusion block's timestamp minus the timestamp of the newest block the
// page had seen when it broadcast: two chain timestamps, never a browser clock,
// so it is always a multiple of 200 ms and cannot drift with clock skew.
// Vibenet runs Cobalt today; on chains without it `blockTimestampMs` is null
// and only the block number is shown.

export const BLOCK_INTERVAL_MS = 200;

export type Inclusion = {
  /** Block the transaction was included in. */
  blockNumber: number;
  /** Block time in unix milliseconds from the Cobalt `timestampMs` field, or null without it. */
  blockTimestampMs: number | null;
  /**
   * Chain time from broadcast to inclusion: the inclusion block's timestamp
   * minus the timestamp of the newest block seen at broadcast. Null when no
   * block was seen at broadcast (socket down, recovered transaction).
   */
  chainMs: number | null;
  /** The same fact in blocks: inclusion block minus the block seen at broadcast. */
  blocksAfterSend: number | null;
};

/** The newest head the page had received when it broadcast. */
export type SendAnchor = { number: number; timestampMs: number | null };

/** Parse a JSON-RPC quantity (`0x…`) to a number; null when absent or malformed. */
export function quantityToNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** A millisecond timestamp given either parsed (from the head stream) or as a JSON-RPC quantity. */
function toMilliseconds(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  return quantityToNumber(value);
}

/**
 * Build an Inclusion from the receipt's block, that block's header, and the
 * head seen at broadcast. A block count that is zero or negative means the
 * anchor came from a replica ahead of the inclusion block; it yields no
 * latency rather than a wrong one.
 */
export function inclusionFromChain(
  receipt: { blockNumber?: unknown } | null | undefined,
  block: { timestampMs?: unknown } | null | undefined,
  anchor: SendAnchor | null,
): Inclusion | null {
  const blockNumber = quantityToNumber(receipt?.blockNumber);
  if (blockNumber === null) return null;
  const blockTimestampMs = toMilliseconds(block?.timestampMs);
  const blocksAfterSend = anchor && blockNumber - anchor.number > 0 ? blockNumber - anchor.number : null;
  let chainMs: number | null = null;
  if (blocksAfterSend !== null) {
    chainMs =
      blockTimestampMs !== null && anchor?.timestampMs != null
        ? blockTimestampMs - anchor.timestampMs
        : blocksAfterSend * BLOCK_INTERVAL_MS;
  }
  return { blockNumber, blockTimestampMs, chainMs, blocksAfterSend };
}

/** The 200 ms slot inside the second: `.000`, `.200`, … or null without Cobalt metadata. */
export function slotLabel(blockTimestampMs: number | null): string | null {
  if (blockTimestampMs === null) return null;
  return `.${String(blockTimestampMs % 1000).padStart(3, '0')}`;
}

/** Latency for display: `400 ms` under a second, `1.8 s` from a second up. */
export function latencyLabel(ms: number): string {
  const rounded = Math.round(ms);
  if (rounded < 1000) return `${rounded} ms`;
  return `${(rounded / 1000).toFixed(1)} s`;
}

/** `1 block` / `3 blocks` after broadcast, or null without an anchor. */
export function blocksAfterSendLabel(inclusion: Pick<Inclusion, 'blocksAfterSend'>): string | null {
  const n = inclusion.blocksAfterSend;
  if (n === null) return null;
  return `${n} ${n === 1 ? 'block' : 'blocks'}`;
}

/** One-line summary: `Landed in 200 ms · block 136,522 · .200`, or without latency `block 136,522 · .200`. */
export function formatInclusion(inclusion: Inclusion): string {
  const parts: string[] = [];
  if (inclusion.chainMs !== null) parts.push(`Landed in ${latencyLabel(inclusion.chainMs)}`);
  parts.push(`block ${inclusion.blockNumber.toLocaleString()}`);
  const slot = slotLabel(inclusion.blockTimestampMs);
  if (slot) parts.push(slot);
  return parts.join(' · ');
}
