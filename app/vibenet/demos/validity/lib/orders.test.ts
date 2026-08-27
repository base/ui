import { describe, expect, it } from 'vitest';

import { occupyingOrder, maxBlockForExpiry, orderBlockExpired, orderWallClockExpired, restingOrderToReplace, tapeCrossedAt } from './orders';

describe('orderWallClockExpired', () => {
  it('expires a resting order after the window plus grace', () => {
    const order = { status: 'pending' as const, submittedAt: 1_000, expirySeconds: 5 };
    expect(orderWallClockExpired(order, 1_000 + 5_000 + 1_000)).toBe(false);
    expect(orderWallClockExpired(order, 1_000 + 5_000 + 2_001)).toBe(true);
  });

  it('does not expire fills', () => {
    const order = { status: 'filled' as const, submittedAt: 1_000, expirySeconds: 5 };
    expect(orderWallClockExpired(order, 1_000 + 60_000)).toBe(false);
  });
});

describe('orderBlockExpired', () => {
  it('expires once the chain is past maxBlock', () => {
    const order = { status: 'pending' as const, maxBlock: 100n };
    expect(orderBlockExpired(order, 100n)).toBe(false);
    expect(orderBlockExpired(order, 101n)).toBe(true);
  });
});

describe('maxBlockForExpiry', () => {
  it('uses ~2s L2 blocks, not flashblock cadence', () => {
    expect(maxBlockForExpiry(1_000n, 60)).toBe(1_030n);
    expect(maxBlockForExpiry(1_000n, 5)).toBe(1_003n);
  });
});

describe('tapeCrossedAt', () => {
  it('uses the first print on the fill side, not a later wick', () => {
    const samples = [
      { t: 1_000, price: 0.083 },
      { t: 2_000, price: 0.0816 },
      { t: 3_000, price: 0.0828 },
    ];
    expect(tapeCrossedAt(samples, 1_500, 0.0816, 'buy')).toBe(2_000);
  });

  it('ignores prints before submit', () => {
    const samples = [
      { t: 1_000, price: 0.08 },
      { t: 3_000, price: 0.082 },
    ];
    expect(tapeCrossedAt(samples, 2_000, 0.081, 'sell')).toBe(3_000);
  });
});

const fees = { nonce: 3, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n };

describe('occupyingOrder', () => {
  it('finds an expired order that may still hold the nonce', () => {
    const expired = { id: 'e', status: 'expired' as const, ...fees };
    expect(occupyingOrder([expired], 3)?.id).toBe('e');
  });
});

describe('restingOrderToReplace', () => {
  it('replaces only an active resting order', () => {
    const pending = { id: 'p', status: 'pending' as const, ...fees };
    const expired = { id: 'e', status: 'expired' as const, ...fees };
    expect(restingOrderToReplace([pending], 3)?.id).toBe('p');
    expect(restingOrderToReplace([expired], 3)).toBeUndefined();
  });
});
