export type ReflexOutcome = 'human' | 'block' | 'tie';

/** Compare two durations measured from the same broadcast callback. */
export function reflexOutcome(reactionMs: number, inclusionMs: number): ReflexOutcome {
  if (reactionMs < inclusionMs) return 'human';
  if (reactionMs > inclusionMs) return 'block';
  return 'tie';
}

export function outcomeCopy(outcome: ReflexOutcome): { title: string; detail: string } {
  if (outcome === 'human') {
    return {
      title: 'You beat the block.',
      detail: 'You hit the target before this page observed the transaction receipt.',
    };
  }
  if (outcome === 'tie') {
    return {
      title: 'Dead heat.',
      detail: 'Your click and the transaction receipt arrived in the same millisecond.',
    };
  }
  return {
    title: 'The block beat you.',
    detail: 'Vibenet included the transaction before you hit the target.',
  };
}

/**
 * Below this, top the account up before a race. A Reflex transaction costs
 * about 67k gas at 1 gwei (~0.000067 ETH); the faucet drips 0.1 ETH.
 */
export const MIN_RACE_BALANCE_WEI = 1_000_000_000_000_000n; // 0.001 ETH

/**
 * The node reports every txpool rejection as JSON-RPC -32003, which viem
 * renders as the generic "Transaction creation failed." The node's reason is
 * in `details`; translate the one a player can act on and surface the rest.
 */
export function raceErrorMessage(cause: unknown): string {
  const e = cause as { shortMessage?: string; details?: string; message?: string };
  const reason = e?.details || e?.shortMessage || e?.message || String(cause);
  if (/insufficient funds/i.test(reason)) {
    return 'This account has no ETH on Vibenet to pay for gas (the network may have been reset). Try again to top it up from the faucet.';
  }
  return reason;
}
