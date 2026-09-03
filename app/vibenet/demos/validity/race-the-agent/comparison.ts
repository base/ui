import type { Address, Hex } from 'viem';

import { CANDLE_SAMPLE_MS } from '../lib/constants';
import { conditionalWithdrawalEnabledPredicate } from '../lib/conditionalWithdrawal';
import { blockNumberPredicate } from '../lib/predicates';
import type { ValidityPredicate } from '../lib/types';

export const RACE_VALIDITY_SECONDS = 15;
export const AGENT_DISABLED_DWELL_MIN_MS = 2_000;
export const AGENT_DISABLED_DWELL_MAX_MS = 10_000;

export type AttemptStatus = 'idle' | 'submitting' | 'pending' | 'success' | 'reverted' | 'expired' | 'error';

export type Attempt = {
  number?: number;
  status: AttemptStatus;
  hash?: Hex;
  submittedAt?: number;
  submittedBlock?: bigint;
  includedAt?: number;
  includedBlock?: bigint;
  error?: string;
};

export function isAttemptTerminal(status: AttemptStatus): boolean {
  return status === 'success' || status === 'reverted' || status === 'expired' || status === 'error';
}

export function canSubmitAttempt(status: AttemptStatus): boolean {
  return status !== 'pending' && status !== 'submitting';
}

export const canSubmitValidity = canSubmitAttempt;

export function canSubmitManual(args: {
  status: AttemptStatus;
  prepared: boolean;
  hasAccount: boolean;
  hasClient: boolean;
  hasContract: boolean;
  observedEnabled: boolean | null;
}): boolean {
  return (
    args.prepared &&
    args.hasAccount &&
    args.hasClient &&
    args.hasContract &&
    args.observedEnabled !== null &&
    canSubmitAttempt(args.status)
  );
}

export function preserveCompletedAttempt(
  history: Attempt[],
  current: Attempt,
): Attempt[] {
  if (!isAttemptTerminal(current.status)) return history;
  return [current, ...history];
}

/** Live current attempt followed by prior attempts, newest first and without duplicates. */
export function attemptHistoryRows(current: Attempt, history: Attempt[]): Attempt[] {
  const candidates = current.status === 'idle' ? history : [current, ...history];
  const seen = new Set<string>();
  return candidates.filter((attempt, index) => {
    const key = attempt.number !== undefined
      ? `number:${attempt.number}`
      : attempt.hash
        ? `hash:${attempt.hash.toLowerCase()}`
        : attempt.submittedAt !== undefined
          ? `submitted:${attempt.submittedAt}`
          : `row:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function randomInteger(random: number, min: number, max: number): number {
  const bounded = Math.min(Math.max(random, 0), 0.999999999);
  return min + Math.floor(bounded * (max - min + 1));
}

export function randomAgentDwellMs(random = Math.random()): number {
  return randomInteger(random, AGENT_DISABLED_DWELL_MIN_MS, AGENT_DISABLED_DWELL_MAX_MS);
}

export function scheduledAgentOpenBlock(currentBlock: bigint, dwellMs: number): bigint {
  return currentBlock + BigInt(Math.ceil(dwellMs / CANDLE_SAMPLE_MS));
}

export function scheduledAgentPredicates(
  withdrawal: Address,
  openBlock: bigint,
): { open: ValidityPredicate[]; close: ValidityPredicate[] } {
  return {
    open: [
      blockNumberPredicate('>=', openBlock),
      blockNumberPredicate('<=', openBlock),
    ],
    close: [
      blockNumberPredicate('>=', openBlock + 1n),
      blockNumberPredicate('<=', openBlock + 1n),
      conditionalWithdrawalEnabledPredicate(withdrawal),
    ],
  };
}

export function shouldRunConditionAgent(args: {
  prepared: boolean;
  hasAgent: boolean;
  hasClient: boolean;
  hasContract: boolean;
}): boolean {
  return args.prepared && args.hasAgent && args.hasClient && args.hasContract;
}

export function shouldRestartConditionAgent(setupValid: boolean, generationActive: boolean): boolean {
  return setupValid && generationActive;
}

export function shortHash(hash?: Hex): string {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : 'Not submitted';
}
