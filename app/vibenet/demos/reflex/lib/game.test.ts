import { TransactionRejectedRpcError } from 'viem';
import { describe, expect, it } from 'vitest';

import { outcomeCopy, raceErrorMessage, reflexOutcome } from './game';

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

describe('raceErrorMessage', () => {
  // What the node returns when a stored account has no ETH, e.g. after a reset.
  const rejected = (reason: string) => new TransactionRejectedRpcError(new Error(reason));

  it('explains an unfunded account instead of the generic -32003 text', () => {
    const message = raceErrorMessage(rejected('insufficient funds for gas * price + value: have 0 want 67000000000000'));
    expect(message).not.toBe('Transaction creation failed.');
    expect(message).toMatch(/no ETH/);
  });

  it("passes through the node's reason for other rejections", () => {
    expect(raceErrorMessage(rejected('nonce too low: next nonce 4, tx nonce 3'))).toBe(
      'nonce too low: next nonce 4, tx nonce 3',
    );
  });
});
