'use client';

import { useState } from 'react';

import { Button } from '../../../../components/ui/Button';
import { InfoTooltip } from '../../../../components/ui/InfoTooltip';
import { Slider } from '../../../../components/ui/Slider';
import { Text } from '../../../../components/ui/Text';
import { AnimatedAmount } from '../../_components/AnimatedAmount';
import { MAX_NONCELESS_SECONDS, TRADE_VIBE } from '../lib/constants';
import { applyOffsetBps, formatPrice, parsePriceWad } from '../lib/predicates';
import { formatTokenAmount, VIBE_SYMBOL } from '../lib/quote';
import type { Side, SubmitMode } from '../lib/types';

const TRADE_LABEL = formatTokenAmount(TRADE_VIBE);

const EXPIRIES = [5, 15, 60] as const;
const DELAYS = [0, 5, 15] as const;
const OFFSET_MAX_BPS = 500;
const OFFSET_STEP_BPS = 10;
const OFFSET_MARKS = [0, 100, 200, 300, 400, 500] as const;

type Props = {
  spotWad: bigint;
  side: Side;
  offsetBps: number;
  expirySeconds: number;
  delaySeconds: number;
  submitMode: SubmitMode;
  busy: boolean;
  vibeBalance: bigint | null;
  costHint: string | null;
  /** Manual target price; set from the price input, cleared when the slider moves. */
  priceOverrideWad: bigint | null;
  onSide: (side: Side) => void;
  onOffset: (bps: number) => void;
  onPriceOverride: (wad: bigint | null) => void;
  onExpiry: (seconds: number) => void;
  onDelay: (seconds: number) => void;
  onSubmitMode: (mode: SubmitMode) => void;
  onSubmit: () => void;
  canAfford: boolean;
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
  delaySeconds,
  submitMode,
  busy,
  vibeBalance,
  costHint,
  priceOverrideWad,
  onSide,
  onOffset,
  onExpiry,
  onDelay,
  onSubmitMode,
  onSubmit,
  onPriceOverride,
  canAfford,
}: Props) {
  const overrideActive = priceOverrideWad !== null;
  const target = priceOverrideWad ?? applyOffsetBps(spotWad, side, offsetBps);
  const effectiveBps =
    spotWad > 0n ? Math.round((Number(target - spotWad) / Number(spotWad)) * 10_000) : 0;
  const signed = overrideActive
    ? effectiveBps === 0
      ? '±0%'
      : `${effectiveBps > 0 ? '+' : '−'}${formatBps(Math.abs(effectiveBps))}`
    : offsetBps === 0
      ? '±0%'
      : side === 'buy'
        ? `−${formatBps(offsetBps)}`
        : `+${formatBps(offsetBps)}`;
  // Raw text while the price input is being edited; null shows the computed target.
  // Blur clears it, and anything that resets the override (slider, side flip)
  // first steals focus from the input, so no sync with the override is needed.
  const [priceText, setPriceText] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-baseline justify-between gap-3">
        <Text variant="title3">Conditional swap</Text>
        <Text variant="label.mono" className="tabular-nums text-bds-gray-60">
          mid ${formatPrice(spotWad)}
        </Text>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <Text variant="caption" tone="muted">
            Your {VIBE_SYMBOL}
          </Text>
          <Text variant="label.mono" className="tabular-nums">
            {vibeBalance === null ? (
              '…'
            ) : (
              <AnimatedAmount text={formatTokenAmount(vibeBalance)} decimals={0} group />
            )}
          </Text>
        </div>
        {costHint ? (
          <Text variant="footnote" tone="muted">
            {costHint}
          </Text>
        ) : null}
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
          Buy {TRADE_LABEL} {VIBE_SYMBOL}
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
          Sell {TRADE_LABEL} {VIBE_SYMBOL}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Text variant="caption" tone="muted">
            {target === spotWad ? 'At mid' : target < spotWad ? 'Below mid' : 'Above mid'}
          </Text>
          <Text variant="label.mono" className="tabular-nums text-bds-gray-60">
            {signed}
          </Text>
        </div>
        <div className={overrideActive ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          <Slider
            value={offsetBps}
            min={0}
            max={OFFSET_MAX_BPS}
            step={OFFSET_STEP_BPS}
            onChange={onOffset}
            marks={OFFSET_MARKS.map((bps) => ({
              value: bps,
              label: bps === 0 ? '0%' : formatBps(bps),
            }))}
            aria-label="Offset from mid"
          />
        </div>
        {overrideActive ? (
          <Text variant="footnote" tone="muted">
            Custom price set — move the slider to clear it.
          </Text>
        ) : null}
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
        <div
          className={`mt-1 flex items-baseline text-[18px] font-[500] leading-[26px] tracking-tight md:text-[20px] md:leading-[28px] ${
            side === 'buy' ? 'text-bds-green-70' : 'text-bds-red-70'
          }`}
        >
          <span>$</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Target price"
            value={priceText ?? formatPrice(target)}
            onFocus={() => setPriceText(formatPrice(target))}
            onChange={(event) => {
              const text = event.target.value;
              setPriceText(text);
              const wad = parsePriceWad(text);
              if (wad !== null) onPriceOverride(wad);
            }}
            onBlur={() => setPriceText(null)}
            className={`w-fit min-w-0 max-w-full cursor-text border-b border-dashed bg-transparent tabular-nums outline-none transition-colors focus:border-solid ${
              side === 'buy'
                ? 'border-bds-green-70/40 hover:border-bds-green-70 focus:border-bds-green-70'
                : 'border-bds-red-70/40 hover:border-bds-red-70 focus:border-bds-red-70'
            }`}
            size={Math.max((priceText ?? formatPrice(target)).length, 4)}
          />
        </div>
        <Text variant="footnote" className="mt-1 tabular-nums text-bds-gray-60">
          mid {signed} · {overrideActive ? 'custom price' : 'type to set a price'}
        </Text>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Text variant="caption" tone="muted">
            Mempool
          </Text>
          <InfoTooltip label="About mempool mode">
            Sequential resubmits on the same nonce, so a new order replaces the resting one. Concurrent
            uses nonceless (EIP-8130) transactions so several orders can be pending at once.
          </InfoTooltip>
        </div>
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
            Sequential
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
            ? 'One transaction at a time via sequential nonces.'
            : `Submit multiple nonceless transactions simultaneously. Max expiry ${MAX_NONCELESS_SECONDS}s.`}
        </Text>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Text variant="caption" tone="muted">
              Expiry
            </Text>
            <InfoTooltip label="About expiry">
              Drops the swap from the mempool once this much time has passed — the ceiling paired
              with the delay floor.
            </InfoTooltip>
          </div>
          <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Text variant="caption" tone="muted">
              Delay
            </Text>
            <InfoTooltip label="About delay">
              Holds the swap until this much time has passed — the floor paired with the expiry
              ceiling.
            </InfoTooltip>
          </div>
          <div className="flex flex-wrap gap-2">
            {DELAYS.map((seconds) => {
              const blocked = seconds > 0 && seconds >= expirySeconds;
              return (
                <button
                  key={seconds}
                  type="button"
                  disabled={blocked}
                  title={blocked ? 'Delay must be shorter than expiry' : undefined}
                  onClick={() => onDelay(seconds)}
                  className={
                    blocked
                      ? 'rounded-full border border-bds-gray-10 px-3 py-1 text-[12px] text-bds-gray-40 dark:border-white/10'
                      : seconds === delaySeconds
                        ? 'rounded-full bg-foreground px-3 py-1 text-[12px] text-background'
                        : 'rounded-full border border-bds-gray-10 px-3 py-1 text-[12px] dark:border-white/10'
                  }
                >
                  {seconds === 0 ? 'Off' : `${seconds}s`}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <Button onClick={onSubmit} disabled={busy || !canAfford} className="w-full">
        {busy
          ? 'Submitting…'
          : !canAfford
            ? side === 'buy'
              ? `Need USDV to buy ${TRADE_LABEL}`
              : `Need ${TRADE_LABEL} ${VIBE_SYMBOL} to sell`
            : `${side === 'buy' ? 'Buy' : 'Sell'} ${TRADE_LABEL} if ${side === 'buy' ? '≤' : '≥'} $${formatPrice(target)}`}
      </Button>
    </div>
  );
}
