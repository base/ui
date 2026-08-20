import { isAddress } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VIBENET } from '../../account/library/chains';
import { PAYER_STORAGE_KEY, WALLET_STORAGE_KEY } from './constants';
import {
  clearPayer,
  clearWallet,
  createPayer,
  createWallet,
  loadPayer,
  loadWallet,
  payerAddress,
  savePayer,
  saveWallet,
  tokenGasFee,
  walletAddress,
  type StoredB20Wallet,
} from './wallet8130';

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

describe('b20 demo wallet storage', () => {
  it('creates a v1 wallet with 32-byte key material', () => {
    const wallet = createWallet();
    expect(wallet.v).toBe(1);
    expect(wallet.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(wallet.salt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(createWallet().privateKey).not.toBe(wallet.privateKey);
  });

  it('round-trips through localStorage', () => {
    installLocalStorage();
    const wallet = createWallet();
    saveWallet(wallet);
    expect(loadWallet()).toEqual(wallet);
    clearWallet();
    expect(loadWallet()).toBeNull();
  });

  it('rejects corrupt or versioned-away payloads', () => {
    const values = installLocalStorage();
    values.set(WALLET_STORAGE_KEY, 'not json');
    expect(loadWallet()).toBeNull();
    values.set(WALLET_STORAGE_KEY, JSON.stringify({ v: 2, privateKey: '0x1', salt: '0x2', createdAt: 0 }));
    expect(loadWallet()).toBeNull();
    values.set(WALLET_STORAGE_KEY, JSON.stringify({ v: 1, createdAt: 0 }));
    expect(loadWallet()).toBeNull();
  });

  it('round-trips the demo payer key and derives its EOA address', () => {
    const values = installLocalStorage();
    const payer = createPayer();
    expect(payer.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    savePayer(payer);
    expect(loadPayer()).toEqual(payer);
    expect(isAddress(payerAddress(payer))).toBe(true);
    clearPayer();
    expect(loadPayer()).toBeNull();
    values.set(PAYER_STORAGE_KEY, JSON.stringify({ v: 2, privateKey: '0x1' }));
    expect(loadPayer()).toBeNull();
  });

  it('charges a flat 0.1-token gas fee scaled to decimals', () => {
    expect(tokenGasFee(18)).toBe(10n ** 17n);
    expect(tokenGasFee(6)).toBe(10n ** 5n);
    expect(tokenGasFee(0)).toBe(1n);
  });

  it('derives a deterministic address from key + salt + deployment', () => {
    const wallet: StoredB20Wallet = {
      v: 1,
      privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      salt: `0x${'11'.repeat(32)}`,
      createdAt: 0,
    };
    const address = walletAddress(wallet, VIBENET.deployment);
    expect(isAddress(address)).toBe(true);
    expect(walletAddress(wallet, VIBENET.deployment)).toBe(address);
    // A different salt yields a different account.
    expect(walletAddress({ ...wallet, salt: `0x${'22'.repeat(32)}` }, VIBENET.deployment)).not.toBe(address);
  });
});
