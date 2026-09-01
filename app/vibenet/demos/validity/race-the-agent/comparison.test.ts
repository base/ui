import { describe, expect, it } from 'vitest';

import {
  AGENT_DISABLED_DWELL_MAX_MS,
  AGENT_DISABLED_DWELL_MIN_MS,
  agentDisableSubmitBlock,
  attemptHistoryRows,
  canResetRace,
  canSubmitManual,
  canSubmitValidity,
  comparisonResult,
  isAttemptTerminal,
  preserveCompletedAttempt,
  randomAgentDwellMs,
  randomAgentOpenBlocks,
  RACE_VALIDITY_SECONDS,
  shouldRunConditionAgent,
  shouldRestartConditionAgent,
  type Attempt,
} from './comparison';
import { noncelessFields } from '../../../library/aa';
import { CANDLE_SAMPLE_MS } from '../lib/constants';

function success(block: bigint): Attempt {
  return { status: 'success', includedBlock: block };
}

describe('comparisonResult', () => {
  it('uses inclusion block ordering instead of browser timestamps', () => {
    expect(comparisonResult(success(10n), { ...success(11n), includedAt: 1 })).toBe('validity-first');
    expect(comparisonResult({ ...success(12n), includedAt: 1 }, success(11n))).toBe('manual-first');
    expect(comparisonResult(success(12n), success(12n))).toBe('same-block');
  });

  it('describes one-sided and unfinished outcomes', () => {
    expect(comparisonResult(success(10n), { status: 'reverted' })).toBe('validity-only');
    expect(comparisonResult({ status: 'expired' }, success(10n))).toBe('manual-only');
    expect(comparisonResult(success(10n), { status: 'idle' })).toBe('none');
    expect(comparisonResult({ status: 'pending' }, { status: 'idle' })).toBe('none');
    expect(comparisonResult({ status: 'expired' }, { status: 'idle' })).toBe('neither-succeeded');
    expect(comparisonResult({ status: 'reverted' }, { status: 'error' })).toBe('neither-succeeded');
  });
});

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
  it('samples condition state at the 200ms Vibenet block cadence', () => {
    expect(CANDLE_SAMPLE_MS).toBe(200);
  });

  it('uses a conservative nonce-free validity window below the protocol maximum', () => {
    const now = 1_700_000_000_000;
    const fields = noncelessFields(RACE_VALIDITY_SECONDS, now);
    expect(RACE_VALIDITY_SECONDS).toBe(15);
    expect(fields.validBefore).toBe(BigInt(now + 15_000));
  });

  it('blocks reset only while a submitted validity transaction can still land', () => {
    expect(canResetRace({ status: 'pending' }, 20_000, 10_000)).toBe(false);
    expect(canResetRace({ status: 'pending' }, null, 20_001)).toBe(false);
    expect(canResetRace({ status: 'pending' }, 20_000, 20_001)).toBe(true);
    expect(canResetRace({ status: 'expired' }, 20_000, 10_000)).toBe(true);
  });

  it('runs the condition agent only when automatic setup resources are ready', () => {
    expect(shouldRunConditionAgent({ prepared: true, hasAgent: true, hasClient: true, hasContract: true })).toBe(true);
    expect(shouldRunConditionAgent({ prepared: false, hasAgent: true, hasClient: true, hasContract: true })).toBe(false);
    expect(shouldRunConditionAgent({ prepared: true, hasAgent: false, hasClient: true, hasContract: true })).toBe(false);
    expect(shouldRestartConditionAgent(true, true)).toBe(true);
    expect(shouldRestartConditionAgent(false, true)).toBe(false);
    expect(shouldRestartConditionAgent(true, false)).toBe(false);
  });

  it('chooses bounded disabled dwell times and one or two block openings', () => {
    expect(AGENT_DISABLED_DWELL_MIN_MS).toBe(2_000);
    expect(AGENT_DISABLED_DWELL_MAX_MS).toBe(10_000);
    expect(randomAgentDwellMs(0)).toBe(AGENT_DISABLED_DWELL_MIN_MS);
    expect(randomAgentDwellMs(0.999999)).toBe(AGENT_DISABLED_DWELL_MAX_MS);
    expect(randomAgentOpenBlocks(0)).toBe(1);
    expect(randomAgentOpenBlocks(0.999999)).toBe(2);
    expect(agentDisableSubmitBlock(100n, 1)).toBe(100n);
    expect(agentDisableSubmitBlock(100n, 2)).toBe(101n);
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
