import { isAddress } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PAYER_STORAGE_KEY } from './constants';
import { clearPayer, createPayer, loadPayer, payerAddress, savePayer, tokenGasFee } from './gasPayer';

function installLocalStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe('b20 demo gas payer', () => {
  it('round-trips the demo payer key and derives its EOA address', () => {
    const values = installLocalStorage();
    const payer = createPayer();
    expect(payer.v).toBe(1);
    expect(payer.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(createPayer().privateKey).not.toBe(payer.privateKey);
    savePayer(payer);
    expect(loadPayer()).toEqual(payer);
    expect(isAddress(payerAddress(payer))).toBe(true);
    clearPayer();
    expect(loadPayer()).toBeNull();
    values.set(PAYER_STORAGE_KEY, JSON.stringify({ v: 2, privateKey: '0x1' }));
    expect(loadPayer()).toBeNull();
  });

  it('rejects corrupt payer payloads', () => {
    const values = installLocalStorage();
    values.set(PAYER_STORAGE_KEY, 'not json');
    expect(loadPayer()).toBeNull();
    values.set(PAYER_STORAGE_KEY, JSON.stringify({ v: 1 }));
    expect(loadPayer()).toBeNull();
  });

  it('charges a flat 0.1-token gas fee scaled to decimals', () => {
    expect(tokenGasFee(18)).toBe(10n ** 17n);
    expect(tokenGasFee(6)).toBe(10n ** 5n);
    expect(tokenGasFee(0)).toBe(1n);
  });
});
