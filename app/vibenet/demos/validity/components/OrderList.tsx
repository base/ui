'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';

import { cn } from '../../../../components/ui/cn';
import { CheckIcon } from '../../../../components/ui/icons';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { formatPrice } from '../lib/predicates';
import type { PlacedOrder } from '../lib/types';

const STATUS_LABEL: Record<PlacedOrder['status'], string> = {
  pending: 'pending',
  filled: 'included',
  expired: 'expired · not included',
  replaced: 'replaced',
  error: 'rejected',
};

const CELEBRATE_MS = 2_400;

const CONFETTI_PIECES = [
  { x: -42, y: 36, r: -48, c: 'bg-bds-green-50', d: 0 },
  { x: -18, y: 52, r: 32, c: 'bg-bds-orange-50', d: 40 },
  { x: 8, y: 28, r: -18, c: 'bg-base-blue', d: 20 },
  { x: 28, y: 48, r: 54, c: 'bg-bds-green-40', d: 70 },
  { x: 52, y: 22, r: -36, c: 'bg-bds-orange-40', d: 30 },
  { x: 74, y: 44, r: 22, c: 'bg-bds-green-50', d: 90 },
] as const;

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function FillConfetti() {
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-1 h-16 overflow-visible" aria-hidden="true">
      {CONFETTI_PIECES.map((piece, index) => (
        <span
          key={`${piece.x}-${piece.y}`}
          className={cn(
            'absolute left-1/2 top-2 h-2 w-1.5 rounded-full opacity-0 shadow-sm b20-confetti-piece',
            piece.c,
            index % 3 === 0 && 'w-3 rounded-sm',
          )}
          style={
            {
              '--b20-confetti-x': `${piece.x}px`,
              '--b20-confetti-y': `${piece.y}px`,
              '--b20-confetti-rotate': `${piece.r}deg`,
              animationDelay: `${piece.d}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

type Props = {
  orders: PlacedOrder[];
  highlightedOrderId: string | null;
  onHighlight: (id: string | null) => void;
};

export function OrderList({ orders, highlightedOrderId, onHighlight }: Props) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Text variant="title3">Submitted</Text>
        <Text variant="footnote" tone="muted">
          Conditional swaps land here. Concurrent 8130 orders stack; replace
          mode bumps the last nonce.
        </Text>
      </div>
    );
  }
  const now = Date.now();
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Text variant="title3">Submitted</Text>
      <ul className="flex max-h-[28rem] min-h-0 flex-col gap-2 overflow-y-auto pr-1">
      {orders.map((order) => {
        const filled = order.status === 'filled';
        const celebrating = filled && order.filledAt !== undefined && now - order.filledAt < CELEBRATE_MS;
        const highlighted = order.id === highlightedOrderId;
        return (
          <li
            key={order.id}
            className={cn(
              'relative flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2 outline-none transition-colors',
              filled
                ? 'border-bds-green-20 bg-bds-green-0 dark:border-bds-green-50/40 dark:bg-bds-green-90/20'
                : 'border-bds-gray-10 dark:border-white/10',
              highlighted && !filled && 'border-base-blue bg-base-blue/5',
              celebrating && 'ring-2 ring-bds-green-40',
            )}
            onMouseEnter={() => onHighlight(order.id)}
            onMouseLeave={() => onHighlight(null)}
            onFocus={() => onHighlight(order.id)}
            onBlur={() => onHighlight(null)}
            tabIndex={0}
          >
            {celebrating ? <FillConfetti /> : null}
            <div className="flex items-center justify-between gap-3">
              <Text
                variant="label.mono"
                className={order.side === 'buy' ? 'text-bds-green-70' : 'text-bds-red-70'}
              >
                {order.side} VIBE ${formatPrice(order.targetPriceWad)}
              </Text>
              <span
                className={cn(
                  'flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em]',
                  filled ? 'text-bds-green-70' : 'text-bds-gray-60',
                )}
              >
                {filled ? <CheckIcon size={14} className="text-bds-green-70" /> : null}
                {filled ? 'included!' : STATUS_LABEL[order.status]}
              </span>
            </div>
            <Text variant="footnote" tone="muted" className="tabular-nums">
              {formatClock(order.submittedAt)}
              {order.submitMode === 'concurrent' ? ' · 8130' : order.submitMode === 'replace' ? ' · replace' : null}
              {order.filledAt ? ` → ${formatClock(order.filledAt)}` : null}
              {filled && order.fillPriceWad !== undefined
                ? ` · ${formatPrice(order.fillPriceWad)}`
                : null}
            </Text>
            {filled && order.txHash ? (
              <Link
                href={`${VIBENET_EXPLORER_PATH}/tx/${order.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="w-fit font-mono text-[12px] text-base-blue hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                View transaction
              </Link>
            ) : null}
            {order.status === 'expired' && order.crossedAfterExpiry ? (
              <Text variant="footnote" className="text-bds-orange-50">
                Spot later crossed this price. The expired transaction was not included.
              </Text>
            ) : null}
            {order.error ? (
              <Text variant="footnote" className="text-bds-orange-50">
                {order.error.length > 240 ? `${order.error.slice(0, 237)}…` : order.error}
              </Text>
            ) : null}
          </li>
        );
      })}
      </ul>
    </div>
  );
}
