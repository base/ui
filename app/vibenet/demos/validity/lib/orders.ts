import { BLOCK_SECONDS } from './constants';
import type { PlacedOrder, Side } from './types';

const WALL_CLOCK_GRACE_MS = 2_000;

export function orderWallClockExpired(
  order: Pick<PlacedOrder, 'status' | 'submittedAt' | 'expirySeconds'>,
  now = Date.now(),
): boolean {
  if (order.status !== 'pending') return false;
  return now > order.submittedAt + order.expirySeconds * 1000 + WALL_CLOCK_GRACE_MS;
}

export function orderBlockExpired(
  order: Pick<PlacedOrder, 'status' | 'maxBlock'>,
  block: bigint,
): boolean {
  return order.status === 'pending' && order.maxBlock !== undefined && block > order.maxBlock;
}

/** Inclusive last L2 block the mempool will still hold this validity tx. */
export function maxBlockForExpiry(currentBlock: bigint, expirySeconds: number): bigint {
  const seconds = Math.max(1, expirySeconds);
  const blocks = Math.max(1, Math.ceil(seconds / BLOCK_SECONDS));
  return currentBlock + BigInt(blocks);
}

/** First tape print on the fill side of the limit after submit — not when the receipt lagged in. */
export function tapeCrossedAt(
  samples: { t: number; price: number }[],
  submittedAt: number,
  target: number,
  side: Side,
): number | undefined {
  if (!Number.isFinite(target) || target <= 0) return undefined;
  for (const sample of samples) {
    if (sample.t < submittedAt) continue;
    const hit = side === 'buy' ? sample.price <= target : sample.price >= target;
    if (hit) return sample.t;
  }
  return undefined;
}

export function occupyingOrder(
  orders: Pick<PlacedOrder, 'id' | 'nonce' | 'status' | 'side' | 'maxFeePerGas' | 'maxPriorityFeePerGas'>[],
  nonce: number,
): (typeof orders)[number] | undefined {
  return orders.find(
    (order) =>
      order.nonce === nonce &&
      (order.status === 'pending' || order.status === 'expired') &&
      order.maxFeePerGas !== undefined &&
      order.maxPriorityFeePerGas !== undefined,
  );
}

/** UI replacement only. Expired stays expired even if we bump fees over its pooled nonce. */
export function restingOrderToReplace(
  orders: Pick<PlacedOrder, 'id' | 'nonce' | 'status' | 'side' | 'maxFeePerGas' | 'maxPriorityFeePerGas'>[],
  nonce: number,
): (typeof orders)[number] | undefined {
  return orders.find(
    (order) =>
      order.nonce === nonce &&
      order.status === 'pending' &&
      order.maxFeePerGas !== undefined &&
      order.maxPriorityFeePerGas !== undefined,
  );
}
