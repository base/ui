import type { Address } from 'viem';
import { describe, expect, it } from 'vitest';

import { blocksUnderwater, nonceFree, totalEarned, trackUnderwater, type LiquidationAttempt } from './attempts';

const A = '0x00000000000000000000000000000000000000aa' as Address;
const B = '0x00000000000000000000000000000000000000bb' as Address;

const attempt = (patch: Partial<LiquidationAttempt>): LiquidationAttempt => ({
  id: 1,
  kind: 'validity',
  borrower: A,
  position: { collateral: 10n, debt: 1n },
  status: 'armed',
  submittedAt: 0,
  submittedBlock: 100n,
  maxBlock: 175n,
  ...patch,
});

describe('nonceFree', () => {
  it('blocks a new attempt while one is in flight', () => {
    expect(nonceFree(null, 100n)).toBe(true);
    expect(nonceFree(attempt({ status: 'armed' }), 120n)).toBe(false);
    expect(nonceFree(attempt({ status: 'pending', kind: 'manual' }), 120n)).toBe(false);
    expect(nonceFree(attempt({ status: 'success' }), 120n)).toBe(true);
  });

  it('holds a beaten validity tx until its expiry block passes', () => {
    const beaten = attempt({ status: 'beaten' });
    expect(nonceFree(beaten, 175n)).toBe(false);
    expect(nonceFree(beaten, 176n)).toBe(true);
    expect(nonceFree(beaten, null)).toBe(false);
  });
});

describe('trackUnderwater', () => {
  const pos = { collateral: 10n, debt: 1n };

  it('keeps the first block a position was seen liquidatable', () => {
    const first = trackUnderwater(new Map(), [{ ...pos, borrower: A, liquidatable: true }], 10n);
    const second = trackUnderwater(first, [{ ...pos, borrower: A, liquidatable: true }], 14n);
    expect(second.get(A)?.block).toBe(10n);
  });

  it('restarts when the position recovers or is replaced', () => {
    const first = trackUnderwater(new Map(), [{ ...pos, borrower: A, liquidatable: true }], 10n);
    const recovered = trackUnderwater(first, [{ ...pos, borrower: A, liquidatable: false }], 12n);
    expect(recovered.has(A)).toBe(false);
    const replaced = trackUnderwater(first, [{ collateral: 20n, debt: 3n, borrower: A, liquidatable: true }], 15n);
    expect(replaced.get(A)?.block).toBe(15n);
  });

  it('drops borrowers whose positions are gone', () => {
    const first = trackUnderwater(new Map(), [{ ...pos, borrower: A, liquidatable: true }], 10n);
    expect(trackUnderwater(first, [{ ...pos, borrower: B, liquidatable: true }], 11n).has(A)).toBe(false);
  });
});

it('blocksUnderwater never goes negative when our poll saw the position late', () => {
  expect(blocksUnderwater(10n, 13n)).toBe(3n);
  expect(blocksUnderwater(13n, 12n)).toBe(0n);
  expect(blocksUnderwater(undefined, 12n)).toBeNull();
});

it('totalEarned counts rewards only from successful attempts', () => {
  expect(
    totalEarned([
      attempt({ status: 'success', reward: 5n }),
      attempt({ status: 'reverted', reward: 7n }),
      null,
      attempt({ status: 'success', reward: 11n }),
      attempt({ status: 'success' }),
    ]),
  ).toBe(16n);
});

it('totalEarned can count only validity liquidations', () => {
  const attempts = [
    attempt({ status: 'success', reward: 5n }),
    attempt({ status: 'success', reward: 11n, kind: 'manual' }),
  ];
  expect(totalEarned(attempts, 'validity')).toBe(5n);
  expect(totalEarned(attempts, 'manual')).toBe(11n);
});
