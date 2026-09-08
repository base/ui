// "Landed in 200 ms · block 136,522 · .400" — the inclusion line shown wherever
// a demo reports a sent transaction. Base's Cobalt upgrade produces a block
// every 200 ms and stamps each with a millisecond timestamp, so a tx can name
// the slot it landed in. The latency is chain time: the inclusion block's
// timestamp minus that of the newest block the page had seen at broadcast.
// Vibenet runs Cobalt today; on chains without it the slot is omitted.

import { cn } from '../../../components/ui/cn';
import { Text } from '../../../components/ui/Text';
import { blocksAfterSendLabel, type Inclusion, latencyLabel, slotLabel } from './inclusion';

/**
 * The line under the badge in a transaction result: the claim, in words. Only
 * for blocks that carry Cobalt's millisecond timestamp, so it never shows on a
 * chain without 200 ms blocks.
 */
export function InclusionTagline({ inclusion }: { inclusion: Inclusion }) {
  if (inclusion.blockTimestampMs === null) return null;
  const blocks = blocksAfterSendLabel(inclusion);
  return (
    <Text variant="label.regular" tone="muted">
      {blocks ? `Sealed ${blocks} after broadcast. ` : ''}Brought to you by 200 ms blocks on Base.
    </Text>
  );
}

const SEP = (
  <span className="text-bds-blue-30 dark:text-bds-blue-60" aria-hidden="true">
    ·
  </span>
);

function badgeTitle(inclusion: Inclusion, slot: string | null): string {
  const cadence = slot ? ` Landed in the ${slot} block of its second; vibenet seals one every 200 ms.` : '';
  if (inclusion.chainMs === null) return `Shows the block that carried the transaction.${cadence}`;
  const blocks = blocksAfterSendLabel(inclusion);
  return `Chain time: this block was sealed ${latencyLabel(inclusion.chainMs)} (${blocks}) after the newest block this page had received when it broadcast.${cadence}`;
}

export function InclusionBadge({ inclusion, className }: { inclusion: Inclusion; className?: string }) {
  const slot = slotLabel(inclusion.blockTimestampMs);
  return (
    <span
      className={cn(
        'inclusion-shimmer inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bds-blue-0 px-2.5 py-1 text-[11px] font-normal leading-none tracking-[0px] text-bds-blue-60 dark:text-base-blue',
        className,
      )}
      title={badgeTitle(inclusion, slot)}
    >
      {inclusion.chainMs !== null ? (
        <>
          <span className="font-mono tabular-nums">Landed in {latencyLabel(inclusion.chainMs)}</span>
          {SEP}
          <span>block {inclusion.blockNumber.toLocaleString()}</span>
        </>
      ) : (
        <span>Block {inclusion.blockNumber.toLocaleString()}</span>
      )}
      {slot ? (
        <>
          {SEP}
          <span className="font-mono tabular-nums">{slot}</span>
        </>
      ) : null}
    </span>
  );
}
