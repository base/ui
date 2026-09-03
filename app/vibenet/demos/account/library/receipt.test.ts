import { describe, expect, it } from 'vitest';

import { aaReceiptSucceeded } from './receipt';

describe('aaReceiptSucceeded', () => {
  it('requires both the outer transaction and every AA phase to succeed', () => {
    expect(aaReceiptSucceeded({ status: 'success', eip8130: { phaseStatuses: ['0x1'] } })).toBe(true);
    expect(aaReceiptSucceeded({ status: 'success' })).toBe(true);
    expect(aaReceiptSucceeded({ status: '0x1', eip8130: { phaseStatuses: ['0x1', '0x1'] } })).toBe(true);
    expect(aaReceiptSucceeded({ status: 'reverted', eip8130: { phaseStatuses: ['0x1'] } })).toBe(false);
    expect(aaReceiptSucceeded({ status: '0x0', eip8130: { phaseStatuses: ['0x1'] } })).toBe(false);
    expect(aaReceiptSucceeded({ status: 'success', eip8130: { phaseStatuses: ['0x1', '0x0'] } })).toBe(false);
  });
});
