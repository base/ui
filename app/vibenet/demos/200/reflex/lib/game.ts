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
