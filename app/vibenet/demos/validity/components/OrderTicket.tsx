'use client';

import { Button } from '../../../../components/ui/Button';
import { Text } from '../../../../components/ui/Text';
import { MAX_NONCELESS_SECONDS } from '../lib/constants';
import { applyOffsetBps, formatPrice } from '../lib/predicates';
import type { Side, SubmitMode } from '../lib/types';

const EXPIRIES = [5, 15, 60] as const;
const OFFSETS = [0, 50, 100, 200, 500] as const;

type Props = {
  spotWad: bigint;
  side: Side;
  offsetBps: number;
  expirySeconds: number;
  submitMode: SubmitMode;
  busy: boolean;
  validitySupported: boolean;
  onSide: (side: Side) => void;
  onOffset: (bps: number) => void;
  onExpiry: (seconds: number) => void;
  onSubmitMode: (mode: SubmitMode) => void;
  onSubmit: () => void;
};

function formatBps(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

export function OrderTicket({
  spotWad,
  side,
  offsetBps,
  expirySeconds,
  submitMode,
  busy,
  validitySupported,
  onSide,
  onOffset,
  onExpiry,
  onSubmitMode,
  onSubmit,
}: Props) {
  const target = applyOffsetBps(spotWad, side, offsetBps);
  const signed = offsetBps === 0 ? '±0%' : side === 'buy' ? `−${formatBps(offsetBps)}` : `+${formatBps(offsetBps)}`;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-baseline justify-between gap-3">
        <Text variant="title3">Conditional swap</Text>
        <Text variant="label.mono" className="tabular-nums text-bds-gray-60">
          mid ${formatPrice(spotWad)}
        </Text>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSide('buy')}
          className={
            side === 'buy'
              ? 'rounded-xl bg-bds-green-0 px-3 py-2 text-[13px] font-medium text-bds-green-70 dark:bg-bds-green-90/25'
              : 'rounded-xl border border-bds-gray-10 px-3 py-2 text-[13px] dark:border-white/10'
          }
        >
          Buy VIBE
        </button>
        <button
          type="button"
          onClick={() => onSide('sell')}
          className={
            side === 'sell'
              ? 'rounded-xl bg-bds-red-0 px-3 py-2 text-[13px] font-medium text-bds-red-70 dark:bg-bds-red-90/25'
              : 'rounded-xl border border-bds-gray-10 px-3 py-2 text-[13px] dark:border-white/10'
          }
        >
          Sell VIBE
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <Text variant="caption" tone="muted">
          {offsetBps === 0 ? 'At mid' : side === 'buy' ? 'Below mid' : 'Above mid'}
        </Text>
        <div className="flex flex-wrap gap-2">
          {OFFSETS.map((bps) => (
            <button
              key={bps}
              type="button"
              onClick={() => onOffset(bps)}
              className={
                bps === offsetBps
                  ? 'rounded-full bg-foreground px-3 py-1 text-[12px] text-background'
                  : 'rounded-full border border-bds-gray-10 px-3 py-1 text-[12px] dark:border-white/10'
              }
            >
              {bps === 0 ? '±0%' : `${side === 'buy' ? '−' : '+'}${formatBps(bps)}`}
            </button>
          ))}
        </div>
      </div>
      <div
        className={
          side === 'buy'
            ? 'rounded-xl bg-bds-green-0 px-3 py-3 dark:bg-bds-green-90/20'
            : 'rounded-xl bg-bds-red-0 px-3 py-3 dark:bg-bds-red-90/20'
        }
      >
        <Text variant="footnote" tone="muted">
          Include when price is {side === 'buy' ? '≤' : '≥'}
        </Text>
        <Text
          variant="title3"
          className={`mt-1 tabular-nums ${side === 'buy' ? 'text-bds-green-70' : 'text-bds-red-70'}`}
        >
          ${formatPrice(target)}
        </Text>
        <Text variant="footnote" className="mt-1 tabular-nums text-bds-gray-60">
          mid {signed}
        </Text>
      </div>
      <div className="flex flex-col gap-2">
        <Text variant="caption" tone="muted">
          Mempool
        </Text>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSubmitMode('replace')}
            className={
              submitMode === 'replace'
                ? 'rounded-xl bg-foreground px-3 py-2 text-[13px] font-medium text-background'
                : 'rounded-xl border border-bds-gray-10 px-3 py-2 text-[13px] dark:border-white/10'
            }
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => onSubmitMode('concurrent')}
            className={
              submitMode === 'concurrent'
                ? 'rounded-xl bg-foreground px-3 py-2 text-[13px] font-medium text-background'
                : 'rounded-xl border border-bds-gray-10 px-3 py-2 text-[13px] dark:border-white/10'
            }
          >
            Concurrent
          </button>
        </div>
        <Text variant="footnote" tone="muted">
          {submitMode === 'replace'
            ? 'Same nonce, fee bump. The new swap takes the resting slot.'
            : `8130 nonceless — stack several at once. Envelope max ${MAX_NONCELESS_SECONDS}s.`}
        </Text>
      </div>
      <div className="flex flex-col gap-2">
        <Text variant="caption" tone="muted">
          Expiry
        </Text>
        <div className="flex gap-2">
          {EXPIRIES.map((seconds) => {
            const blocked = submitMode === 'concurrent' && seconds > MAX_NONCELESS_SECONDS;
            return (
              <button
                key={seconds}
                type="button"
                disabled={blocked}
                title={blocked ? `8130 nonceless max is ${MAX_NONCELESS_SECONDS}s` : undefined}
                onClick={() => onExpiry(seconds)}
                className={
                  blocked
                    ? 'rounded-full border border-bds-gray-10 px-3 py-1 text-[12px] text-bds-gray-40 dark:border-white/10'
                    : seconds === expirySeconds
                      ? 'rounded-full bg-foreground px-3 py-1 text-[12px] text-background'
                      : 'rounded-full border border-bds-gray-10 px-3 py-1 text-[12px] dark:border-white/10'
                }
              >
                {seconds}s
              </button>
            );
          })}
        </div>
      </div>
      {!validitySupported ? (
        <Text variant="footnote" className="text-bds-orange-50">
          This RPC does not expose base_sendRawTransactionValidity. The swap will
          still be signed; submission will fail until you point at a node with the
          flag enabled.
        </Text>
      ) : null}
      <Button onClick={onSubmit} disabled={busy} className="w-full">
        {busy ? 'Submitting…' : `Submit if ${side === 'buy' ? '≤' : '≥'} $${formatPrice(target)}`}
      </Button>
    </div>
  );
}
