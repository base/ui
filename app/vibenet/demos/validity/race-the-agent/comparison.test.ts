import { describe, expect, it } from 'vitest';

import {
  AGENT_DISABLED_DWELL_MAX_MS,
  AGENT_DISABLED_DWELL_MIN_MS,
  attemptHistoryRows,
  canSubmitManual,
  canSubmitValidity,
  isAttemptTerminal,
  preserveCompletedAttempt,
  randomAgentDwellMs,
  RACE_VALIDITY_SECONDS,
  scheduledAgentOpenBlock,
  scheduledAgentPredicates,
  shouldRunConditionAgent,
  shouldRestartConditionAgent,
  type Attempt,
} from './comparison';
import { noncelessFields } from '../../../library/aa';
import { conditionalWithdrawalEnabledPredicate } from '../lib/conditionalWithdrawal';
import { blockNumberPredicate } from '../lib/predicates';

const WITHDRAWAL = '0x1111111111111111111111111111111111111111';

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

  it('runs the condition agent only when automatic setup resources are ready', () => {
    expect(shouldRunConditionAgent({ prepared: true, hasAgent: true, hasClient: true, hasContract: true })).toBe(true);
    expect(shouldRunConditionAgent({ prepared: false, hasAgent: true, hasClient: true, hasContract: true })).toBe(false);
    expect(shouldRunConditionAgent({ prepared: true, hasAgent: false, hasClient: true, hasContract: true })).toBe(false);
    expect(shouldRestartConditionAgent(true, true)).toBe(true);
    expect(shouldRestartConditionAgent(false, true)).toBe(false);
    expect(shouldRestartConditionAgent(true, false)).toBe(false);
  });

  it('converts bounded disabled dwell times to 200ms Vibenet schedule blocks', () => {
    expect(AGENT_DISABLED_DWELL_MIN_MS).toBe(2_000);
    expect(AGENT_DISABLED_DWELL_MAX_MS).toBe(10_000);
    expect(randomAgentDwellMs(0)).toBe(AGENT_DISABLED_DWELL_MIN_MS);
    expect(randomAgentDwellMs(0.999999)).toBe(AGENT_DISABLED_DWELL_MAX_MS);
    expect(scheduledAgentOpenBlock(100n, 2_000)).toBe(110n);
    expect(scheduledAgentOpenBlock(100n, 10_000)).toBe(150n);
    expect(scheduledAgentOpenBlock(100n, 2_001)).toBe(111n);
  });

  it('opens only at the exact scheduled block and closes afterward when enabled', () => {
    const predicates = scheduledAgentPredicates(WITHDRAWAL, 110n);
    expect(predicates.open).toEqual([
      blockNumberPredicate('>=', 110n),
      blockNumberPredicate('<=', 110n),
    ]);
    expect(predicates.close).toEqual([
      blockNumberPredicate('>=', 111n),
      blockNumberPredicate('<=', 111n),
      conditionalWithdrawalEnabledPredicate(WITHDRAWAL),
    ]);
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
