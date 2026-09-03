import { BLOCK_SECONDS } from './constants';
import type { PlacedOrder } from './types';

const WALL_CLOCK_GRACE_MS = 400;

export function orderWallClockExpired(
  order: Pick<PlacedOrder, 'status' | 'submittedAt' | 'expirySeconds' | 'delaySeconds'>,
  now = Date.now(),
): boolean {
  if (order.status !== 'pending') return false;
  const totalSeconds = (order.delaySeconds ?? 0) + order.expirySeconds;
  return now > order.submittedAt + totalSeconds * 1000 + WALL_CLOCK_GRACE_MS;
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

/** Inclusive first L2 block a delayed validity tx may land in. */
export function minBlockForDelay(currentBlock: bigint, delaySeconds: number): bigint {
  if (delaySeconds <= 0) return currentBlock;
  const blocks = Math.max(1, Math.ceil(delaySeconds / BLOCK_SECONDS));
  return currentBlock + BigInt(blocks);
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
/** Wall-clock expire restored pending rows without analytics. */
export function ageRestoredOrders(orders: PlacedOrder[], now = Date.now()): PlacedOrder[] {
  return orders.map((order) =>
    orderWallClockExpired(order, now) ? { ...order, status: 'expired' } : order,
  );
}

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
