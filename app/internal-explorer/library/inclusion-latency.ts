// Inclusion latency is the same T+ the event timeline shows: first observed
// event to inclusion. Flashblock publication counts as inclusion; later block
// inclusion events are ignored when a flashblock confirmation exists.
// Null when that span cannot be measured.

export type TimedExplorerEvent = {
  event: string;
  timestamp: number;
};

const FLASHBLOCK_INCLUSION_EVENTS = new Set(['BUILDER_FLASHBLOCK_PUBLISHED']);

const BLOCK_INCLUSION_EVENTS = new Set([
  'BUILDER_INCLUDED',
  'TXPOOL_BLOCK_INCLUDED',
  'BlockIncluded',
  'BuilderIncluded',
]);

export function isInclusionEvent(event: string): boolean {
  return FLASHBLOCK_INCLUSION_EVENTS.has(event) || BLOCK_INCLUSION_EVENTS.has(event);
}

function inclusionTimestamp(timed: readonly TimedExplorerEvent[]): number | null {
  const flashblockTimes = timed
    .filter((event) => FLASHBLOCK_INCLUSION_EVENTS.has(event.event))
    .map((event) => event.timestamp);
  if (flashblockTimes.length > 0) {
    return Math.min(...flashblockTimes);
  }

  const blockTimes = timed
    .filter((event) => BLOCK_INCLUSION_EVENTS.has(event.event))
    .map((event) => event.timestamp);
  if (blockTimes.length === 0) return null;
  return Math.max(...blockTimes);
}

/** Milliseconds from the earliest event to flashblock or block inclusion. */
export function inclusionLatencyMs(events: readonly TimedExplorerEvent[]): number | null {
  const timed = events.filter((event) => Number.isFinite(event.timestamp));
  const includedAt = inclusionTimestamp(timed);
  if (includedAt === null || timed.length < 2) return null;

  const start = Math.min(...timed.map((event) => event.timestamp));
  const elapsed = includedAt - start;
  return elapsed > 0 ? elapsed : null;
}
