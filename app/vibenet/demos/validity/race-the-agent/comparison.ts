import type { Hex } from 'viem';

export const RACE_VALIDITY_SECONDS = 15;

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

export function shortHash(hash?: Hex): string {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : 'Not submitted';
}
