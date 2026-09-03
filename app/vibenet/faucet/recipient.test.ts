import { describe, expect, it } from 'vitest';

import { defaultFaucetRecipient } from './recipient';

const accounts = [
  { id: 'first', address: '0x1111111111111111111111111111111111111111' },
  { id: 'active', address: '0x2222222222222222222222222222222222222222' },
];

describe('defaultFaucetRecipient', () => {
  it('uses the active saved account', () => {
    expect(defaultFaucetRecipient(accounts, 'active')).toBe(accounts[1].address);
  });

  it('falls back to the first saved account when the active account is unavailable', () => {
    expect(defaultFaucetRecipient(accounts, 'missing')).toBe(accounts[0].address);
  });

  it('returns null when there are no saved accounts', () => {
    expect(defaultFaucetRecipient([], null)).toBeNull();
  });
});
