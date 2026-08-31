import { describe, expect, it } from 'vitest';

import { occupyingOrder, maxBlockForExpiry, orderBlockExpired, orderWallClockExpired, restingOrderToReplace } from './orders';

describe('orderWallClockExpired', () => {
  it('expires a resting order after the window plus grace', () => {
    const order = { status: 'pending' as const, submittedAt: 1_000, expirySeconds: 5 };
    expect(orderWallClockExpired(order, 1_000 + 5_000 + 400)).toBe(false);
    expect(orderWallClockExpired(order, 1_000 + 5_000 + 401)).toBe(true);
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
  it('uses 200ms Denim blocks, not 2s pre-Denim heads', () => {
    expect(maxBlockForExpiry(1_000n, 60)).toBe(1_300n);
    expect(maxBlockForExpiry(1_000n, 5)).toBe(1_025n);
  });
});

const fees = { nonce: 3, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, side: 'buy' as const };

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
