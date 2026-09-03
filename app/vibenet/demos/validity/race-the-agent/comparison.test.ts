import { describe, expect, it } from 'vitest';

import {
  attemptHistoryRows,
  canSubmitManual,
  canSubmitValidity,
  isAttemptTerminal,
  preserveCompletedAttempt,
  RACE_VALIDITY_SECONDS,
  type Attempt,
} from './comparison';
import { noncelessFields } from '../../../library/aa';

describe('isAttemptTerminal', () => {
  it('only stops on final receipt or expiry states', () => {
    expect(isAttemptTerminal('success')).toBe(true);
    expect(isAttemptTerminal('reverted')).toBe(true);
    expect(isAttemptTerminal('expired')).toBe(true);
    expect(isAttemptTerminal('pending')).toBe(false);
    expect(isAttemptTerminal('error')).toBe(true);
  });
});

describe('race lifecycle predicates', () => {
  it('uses a conservative nonce-free validity window below the protocol maximum', () => {
    const now = 1_700_000_000_000;
    const fields = noncelessFields(RACE_VALIDITY_SECONDS, now);
    expect(RACE_VALIDITY_SECONDS).toBe(15);
    expect(fields.validBefore).toBe(BigInt(now + 15_000));
  });

  it('allows retries after terminal attempts and preserves every completed attempt', () => {
    expect(canSubmitValidity('pending')).toBe(false);
    expect(canSubmitValidity('submitting')).toBe(false);
    expect(canSubmitValidity('expired')).toBe(true);
    expect(canSubmitValidity('success')).toBe(true);
    const manual = (status: Attempt['status'], observedEnabled: boolean | null) => canSubmitManual({
      status,
      prepared: true,
      hasAccount: true,
      hasClient: true,
      hasContract: true,
      observedEnabled,
    });
    expect(manual('pending', false)).toBe(false);
    expect(manual('submitting', true)).toBe(false);
    expect(manual('success', false)).toBe(true);
    expect(manual('reverted', true)).toBe(true);
    expect(manual('idle', null)).toBe(false);
    const current: Attempt = { number: 5, status: 'expired' };
    const history: Attempt[] = [
      { number: 4, status: 'success' },
      { number: 3, status: 'reverted' },
      { number: 2, status: 'error' },
      { number: 1, status: 'success' },
    ];
    expect(preserveCompletedAttempt(history, current)).toEqual([
      current,
      ...history,
    ]);
    expect(preserveCompletedAttempt([], { status: 'pending' })).toEqual([]);
  });

  it('shows the live attempt immediately before prior attempts without duplicates', () => {
    const current: Attempt = { number: 2, status: 'pending' };
    const prior: Attempt[] = [
      { number: 2, status: 'submitting' },
      { number: 1, status: 'success' },
    ];
    expect(attemptHistoryRows(current, prior)).toEqual([
      current,
      { number: 1, status: 'success' },
    ]);
    expect(attemptHistoryRows({ status: 'idle' }, prior.slice(1))).toEqual(prior.slice(1));
    expect(attemptHistoryRows({ number: 1, status: 'submitting' }, [])).toEqual([
      { number: 1, status: 'submitting' },
    ]);
  });
});
