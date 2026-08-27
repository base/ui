// Inclusion latency is the same T+ the event timeline shows: first observed
// event to the latest inclusion event. Null when that span cannot be measured.

export type TimedExplorerEvent = {
  event: string;
  timestamp: number;
};

const INCLUSION_EVENTS = new Set([
  'BUILDER_INCLUDED',
  'TXPOOL_BLOCK_INCLUDED',
  'BUILDER_FLASHBLOCK_PUBLISHED',
  'BlockIncluded',
  'BuilderIncluded',
]);

export function isInclusionEvent(event: string): boolean {
  return INCLUSION_EVENTS.has(event);
}

/** Milliseconds from the earliest event to the latest inclusion event. */
export function inclusionLatencyMs(events: readonly TimedExplorerEvent[]): number | null {
  const timed = events.filter((event) => Number.isFinite(event.timestamp));
  const inclusionTimes = timed
    .filter((event) => isInclusionEvent(event.event))
    .map((event) => event.timestamp);
  if (inclusionTimes.length === 0 || timed.length < 2) return null;

  const start = Math.min(...timed.map((event) => event.timestamp));
  const includedAt = Math.max(...inclusionTimes);
  const elapsed = includedAt - start;
  return elapsed > 0 ? elapsed : null;
}
