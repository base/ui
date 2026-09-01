import { describe, expect, it } from 'vitest';

import { shortAddress } from './format';

describe('shortAddress', () => {
  it('abbreviates a full address', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
  });

  it('leaves values that already fit untouched', () => {
    expect(shortAddress('0x1234')).toBe('0x1234');
  });

  it('never throws on missing values', () => {
    expect(shortAddress(null)).toBe('—');
    expect(shortAddress(undefined)).toBe('—');
    expect(shortAddress('')).toBe('—');
  });

  it('honours custom lead/tail', () => {
    expect(shortAddress('0x1234567890abcdef', 4, 2)).toBe('0x12…ef');
  });
});
