import { describe, expect, it } from 'vitest';

import { pickLivePair } from './singleton';

describe('pickLivePair', () => {
  it('follows the most recently traded seeded pool over an idle duplicate', () => {
    const idle = { id: 'idle', reserve0: 1n, reserve1: 1n, lastTradeAt: 100 };
    const live = { id: 'live', reserve0: 1n, reserve1: 1n, lastTradeAt: 900 };
    expect(pickLivePair([idle, live])?.id).toBe('live');
  });

  it('skips unseeded pools', () => {
    const empty = { id: 'empty', reserve0: 0n, reserve1: 5n, lastTradeAt: 999 };
    const seeded = { id: 'seeded', reserve0: 1n, reserve1: 1n, lastTradeAt: 1 };
    expect(pickLivePair([empty, seeded])?.id).toBe('seeded');
    expect(pickLivePair([empty])).toBeNull();
  });
});
