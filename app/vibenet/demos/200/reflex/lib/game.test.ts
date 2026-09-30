import { describe, expect, it } from 'vitest';

import { outcomeCopy, reflexOutcome } from './game';

describe('reflexOutcome', () => {
  it('awards the run to the human only when the click is earlier', () => {
    expect(reflexOutcome(199, 200)).toBe('human');
    expect(reflexOutcome(201, 200)).toBe('block');
  });

  it('calls an exact same-millisecond finish a tie', () => {
    expect(reflexOutcome(200, 200)).toBe('tie');
    expect(outcomeCopy('tie').title).toBe('Dead heat.');
  });
});
