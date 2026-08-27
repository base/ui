import { createPublicClient, http, type Address, type Hex } from 'viem';

import { generatePrivateKey, parsePayerError, privateKeyToAccount, type Signer } from '@aa';

import { vibenetApi } from '../../../library/client';
import { VIBENET_RPC_URL } from '../../../library/config';
import { PAYER_STORAGE_KEY } from './constants';

// The demo's own ERC-8168 payer: a plain faucet-funded EOA whose key lives in
// the browser. Any funded key can co-sign `payerAuth` (validated like an EOA
// signature), which is what lets the demo charge gas in the user's B20 — the
// hosted payer only accepts USDV. The account engine composes the transaction;
// this module owns the payer key, its funding, and the fee schedule.
export type StoredB20Payer = { v: 1; privateKey: Hex; createdAt: number };

export function loadPayer(): StoredB20Payer | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PAYER_STORAGE_KEY) ?? 'null') as StoredB20Payer | null;
    if (!stored || stored.v !== 1 || typeof stored.privateKey !== 'string') return null;
    return stored;
  } catch {
    return null;
  }
}

export function savePayer(payer: StoredB20Payer): void {
  try {
    window.localStorage.setItem(PAYER_STORAGE_KEY, JSON.stringify(payer));
  } catch {
    /* unavailable */
  }
}

export function clearPayer(): void {
  try {
    window.localStorage.removeItem(PAYER_STORAGE_KEY);
  } catch {
    /* unavailable */
  }
}

export function createPayer(): StoredB20Payer {
  return { v: 1, privateKey: generatePrivateKey(), createdAt: Date.now() };
}

export function payerAddress(payer: StoredB20Payer): Address {
  return privateKeyToAccount(payer.privateKey).address;
}

/** The signer the engine co-signs `payerAuth` with. */
export function payerSigner(payer: StoredB20Payer): Signer {
  return privateKeyToAccount(payer.privateKey) as unknown as Signer;
}

/** Flat demo fee for token-paid gas: 0.1 of the token per transaction. */
export function tokenGasFee(decimals: number): bigint {
  return decimals > 0 ? 10n ** BigInt(decimals - 1) : 1n;
}

const client = createPublicClient({ transport: http(VIBENET_RPC_URL) });

// Below this the payer EOA gets a fresh faucet drip before co-signing.
const MIN_PAYER_ETH = 3_000_000_000_000_000n; // 0.003 ETH

export async function getEthBalance(address: Address): Promise<bigint | null> {
  // Pin to a fresh block: the public RPC is load-balanced across replicas, and
  // an unpinned read from a lagging one returns stale balances. A replica that
  // doesn't have the block errors instead, which callers treat as "no update".
  try {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    return await client.getBalance({ address, blockNumber });
  } catch {
    return null;
  }
}

/**
 * Drip 0.1 vibenet ETH to an address and wait for it to land. Retries through
 * the faucet's ~10s cooldown; resolves false if funding never shows.
 */
export async function seedWithEth(address: Address): Promise<boolean> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await vibenetApi.faucet.drip({ address });
      break;
    } catch {
      if (attempt >= 3) return false;
      await new Promise((resolve) => setTimeout(resolve, 11_000));
    }
  }
  for (let i = 0; i < 30; i += 1) {
    const balance = await getEthBalance(address);
    if (balance !== null && balance > 0n) return true;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return false;
}

/**
 * Make sure the payer EOA can cover the gas it is about to underwrite. The
 * first token-paid send happens right after the key is minted, so without this
 * the co-signed transaction is rejected for an unfunded payer.
 */
export async function ensurePayerFunded(payer: StoredB20Payer): Promise<void> {
  const address = payerAddress(payer);
  const balance = await getEthBalance(address);
  if (balance !== null && balance >= MIN_PAYER_ETH) return;
  const seeded = await seedWithEth(address);
  if (!seeded) throw new Error('Could not fund the demo gas payer from the faucet. Try again in a minute.');
}

/** Friendly message for payer rejections; `null` when the error is not one. */
export function payerErrorMessage(error: unknown): string | null {
  const rejected = parsePayerError(error);
  if (!rejected) return null;
  switch (rejected.code) {
    case 'BUDGET_EXHAUSTED':
    case 'SENDER_LIMIT_REACHED':
      return "The demo gas payer's budget is used up. Wait a bit, then try again.";
    case 'TEMPORARILY_UNAVAILABLE':
      return 'The gas payer is temporarily unavailable. Try again in a moment.';
    default:
      return `The gas payer declined this transaction${rejected.reason ? `: ${rejected.reason}` : '.'}`;
  }
}
