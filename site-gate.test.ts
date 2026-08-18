import { describe, expect, it } from 'vitest';
import { createGateToken, isValidGateToken } from './site-gate';

describe('site gate token', () => {
  const password = 'test-password';
  const nowSeconds = 1_700_000_000;

  it('accepts a token signed with the configured password', async () => {
    const token = await createGateToken(password, nowSeconds);

    await expect(isValidGateToken(token, password, nowSeconds)).resolves.toBe(true);
  });

  it('rejects tokens signed with another password', async () => {
    const token = await createGateToken(password, nowSeconds);

    await expect(isValidGateToken(token, 'wrong-password', nowSeconds)).resolves.toBe(false);
  });

  it('rejects expired and malformed tokens', async () => {
    const token = await createGateToken(password, nowSeconds);

    await expect(
      isValidGateToken(token, password, nowSeconds + 60 * 60 * 24 * 8),
    ).resolves.toBe(false);
    await expect(
      isValidGateToken('v1.not-a-number.invalid', password, nowSeconds),
    ).resolves.toBe(false);
  });
});