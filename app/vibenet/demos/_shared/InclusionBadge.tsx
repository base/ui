// "Landed in 412 ms · block 136,522 · .400" — the inclusion line shown wherever
// a demo reports a sent transaction. Base's Denim upgrade produces a block
// every 200 ms and stamps each with a millisecond timestamp, so a tx can name
// the slot it landed in. Vibenet runs Denim today; on chains without it the
// slot is omitted and only latency + block remain.

import { cn } from '../../../components/ui/cn';
import { Text } from '../../../components/ui/Text';
import { type Inclusion, latencyLabel, slotLabel } from './inclusion';

/**
 * The line under the badge in a transaction result: the claim, in words. Only
 * for blocks that carry Denim's millisecond timestamp, so it never shows on a
 * chain without 200 ms blocks.
 */
export function InclusionTagline({ inclusion }: { inclusion: Inclusion }) {
  if (inclusion.blockTimestampMs === null) return null;
  return (
    <Text variant="label.regular" tone="muted">
      Brought to you by 200 ms blocks on Base.
    </Text>
  );
}

const SEP = (
  <span className="text-bds-blue-30 dark:text-bds-blue-60" aria-hidden="true">
    ·
  </span>
);

export function InclusionBadge({ inclusion, className }: { inclusion: Inclusion; className?: string }) {
  const slot = slotLabel(inclusion.blockTimestampMs);
  return (
    <span
      className={cn(
        'inclusion-shimmer inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bds-blue-0 px-2.5 py-1 text-[11px] font-normal leading-none tracking-[0px] text-bds-blue-60 dark:text-base-blue',
        className,
      )}
      title={
        slot
          ? `Block time minus send time: ${latencyLabel(inclusion.inclusionMs)}. Included in the ${slot} block of its second (one every 200 ms).`
          : `Receipt seen ${latencyLabel(inclusion.inclusionMs)} after broadcast`
      }
    >
      <span className="font-mono tabular-nums">Landed in {latencyLabel(inclusion.inclusionMs)}</span>
      {SEP}
      <span>block {inclusion.blockNumber.toLocaleString()}</span>
      {slot ? (
        <>
          {SEP}
          <span className="font-mono tabular-nums">{slot}</span>
        </>
      ) : null}
    </span>
  );
}
