import { useEffect, useState } from 'react';
import { createPublicClient, http, type Address, type Hex } from 'viem';

import {
  computeAddress,
  createPayerClient,
  encodeFunctionData,
  encodeWalletCalls,
  estimateGas,
  generatePrivateKey,
  getTransactionCount,
  key,
  parsePayerError,
  privateKeyToAccount,
  sendCalls,
  sendSponsoredCalls,
  toAccount,
  upgradeableProxyBytecode,
  waitForTransactionReceipt,
  type Eip8130Deployment,
  type ToAccountReturnType,
} from '@aa';

import { vibenetApi } from '../../../vibenet/library/client';
import { ACCOUNT_PAYER_URL, VIBENET_RPC_URL } from '../../../vibenet/library/config';
import { deploymentFromContracts, estimateTxGas, VIBENET } from '../../account/library/chains';
import { CHAIN_ID, PAYER_STORAGE_KEY, WALLET_STORAGE_KEY } from './constants';

// The demo wallet is an EIP-8130 smart account made from a throwaway in-browser
// key. Only the key material and CREATE2 salt persist — the address is derived
// at runtime because it also commits to the AccountConfiguration system
// contract, which moves whenever the devnet resets. After a reset the same
// stored key simply yields a fresh (empty) account, which matches the chain:
// the reset wiped its tokens anyway.
export type StoredB20Wallet = { v: 1; privateKey: Hex; salt: Hex; createdAt: number };

export function loadWallet(): StoredB20Wallet | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(WALLET_STORAGE_KEY) ?? 'null') as StoredB20Wallet | null;
    if (!stored || stored.v !== 1 || typeof stored.privateKey !== 'string' || typeof stored.salt !== 'string')
      return null;
    return stored;
  } catch {
    return null;
  }
}

export function saveWallet(wallet: StoredB20Wallet): void {
  try {
    window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
  } catch {
    // The wallet still works for this page load; it just won't survive a refresh.
  }
}

export function clearWallet(): void {
  try {
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
  } catch {
    /* unavailable */
  }
}

export function createWallet(): StoredB20Wallet {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return {
    v: 1,
    privateKey: generatePrivateKey(),
    salt: `0x${Array.from(salt, (b) => b.toString(16).padStart(2, '0')).join('')}` as Hex,
    createdAt: Date.now(),
  };
}

// The demo's own ERC-8168 payer: a plain faucet-funded EOA whose key lives in
// the browser. Any funded key can co-sign `payerAuth` (validated like an EOA
// signature), which is what lets the demo charge gas in the user's B20 — the
// hosted payer only accepts USDV.
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

/** Flat demo fee for token-paid gas: 0.1 of the token per transaction. */
export function tokenGasFee(decimals: number): bigint {
  return decimals > 0 ? 10n ** BigInt(decimals - 1) : 1n;
}

// Proxy code must target the deployed DefaultAccount implementation; the
// upgradeable implementation is not deployed on the native vibenet path.
function accountParams(wallet: StoredB20Wallet, deployment: Eip8130Deployment) {
  const owner = privateKeyToAccount(wallet.privateKey);
  return {
    owner,
    userSalt: wallet.salt,
    code: upgradeableProxyBytecode(deployment.accounts.default),
    initialActors: [key.k1(owner.address)],
    accountConfigAddress: deployment.accountConfiguration,
  };
}

export function walletAddress(wallet: StoredB20Wallet, deployment: Eip8130Deployment): Address {
  const { userSalt, code, initialActors, accountConfigAddress } = accountParams(wallet, deployment);
  return computeAddress({ userSalt, code, initialActors, accountConfigAddress });
}

function accountFor(wallet: StoredB20Wallet, deployment: Eip8130Deployment): ToAccountReturnType {
  const { owner, ...params } = accountParams(wallet, deployment);
  return toAccount({ signer: owner, ...params });
}

/**
 * Live EIP-8130 system-contract addresses, starting from the static
 * last-known-good set. A devnet reset redeploys them at new addresses; fetching
 * from the dataplane means the demo survives a reset without a code change.
 */
export function useDeployment(): Eip8130Deployment {
  const [deployment, setDeployment] = useState<Eip8130Deployment>(VIBENET.deployment);
  useEffect(() => {
    const controller = new AbortController();
    vibenetApi
      .contracts(controller.signal)
      .then((contracts) => {
        const next = deploymentFromContracts(contracts);
        if (next) setDeployment(next);
      })
      .catch(() => {
        /* offline / aborted → keep the static fallback */
      });
    return () => controller.abort();
  }, []);
  return deployment;
}

// Dedicated client for the sponsored path: sendSponsoredCalls requires a
// configured `chain` (the shared read client in constants.ts has none).
const sponsorClient = createPublicClient({
  chain: {
    id: CHAIN_ID,
    name: 'Vibenet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [VIBENET_RPC_URL] } },
  },
  transport: http(VIBENET_RPC_URL),
});

const payerClient = createPayerClient({ url: ACCOUNT_PAYER_URL });

export type SponsoredCall = { to: Address; data: Hex };
export type TokenGasConfig = { token: Address; symbol: string; decimals: number; payer: StoredB20Payer };
export type SendMode = 'sponsored' | 'self' | 'token';
export type SendResult = { hash: Hex; mode: SendMode };

// Below this the payer EOA gets a fresh faucet drip before co-signing.
const MIN_PAYER_ETH = 3_000_000_000_000_000n; // 0.003 ETH
// Below this the account can't reliably self-pay a transaction.
const MIN_SELF_PAY_ETH = 2_000_000_000_000_000n; // 0.002 ETH

const transferAbi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

export async function getEthBalance(address: Address): Promise<bigint | null> {
  // Pin to a fresh block: the public RPC is load-balanced across replicas, and
  // an unpinned read from a lagging one returns stale balances. A replica that
  // doesn't have the block errors instead, which callers treat as "no update".
  try {
    const blockNumber = await sponsorClient.getBlockNumber({ cacheTime: 0 });
    return await sponsorClient.getBalance({ address, blockNumber });
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

function checkReceipt(receipt: Record<string, unknown> & { eip8130?: { phaseStatuses?: readonly Hex[] } }): void {
  // Raw JSON-RPC receipt: status is '0x0'/'0x1'. An overall success with a
  // reverted phase is still a valid 8130 inclusion, so check both.
  if (receipt.status === '0x0') throw new Error('The transaction reverted onchain. Try again.');
  const phases: readonly Hex[] = receipt.eip8130?.phaseStatuses ?? [];
  if (phases.some((status) => status === '0x0'))
    throw new Error('The transaction was included, but one of its calls reverted. Check the inputs and try again.');
}

/**
 * Broadcast via `send`, confirm the receipt, and retry transient devnet
 * failures:
 * - "actor is not bound": the payer/node validate against account config that
 *   lags the head by ~1 block right after the account's deploy tx.
 * - accepted-then-dropped / expired: hosted-payer terms carry a ~15s expiry, so
 *   a transaction that misses its inclusion window silently disappears.
 * Re-sending is safe when the nonce is pinned (a duplicate can't execute
 * twice); if a timed-out original mined late, its receipt is used instead.
 */
async function confirmWithRetries(send: () => Promise<Hex>): Promise<Hex> {
  let retries = 3;
  let timedOutHash: Hex | null = null;
  for (;;) {
    try {
      const hash = await send();
      try {
        const receipt = await waitForTransactionReceipt(sponsorClient as never, { hash, timeout: 30_000 });
        checkReceipt(receipt);
        return hash;
      } catch (error) {
        if (/timed out/i.test(error instanceof Error ? error.message : '')) timedOutHash = hash;
        throw error;
      }
    } catch (error) {
      if (timedOutHash) {
        const receipt = await waitForTransactionReceipt(sponsorClient as never, {
          hash: timedOutHash,
          timeout: 4_000,
        }).catch(() => null);
        if (receipt) {
          checkReceipt(receipt);
          return timedOutHash;
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      const transient = /actor is not bound|timed out|expired before landing/i.test(message);
      if (retries <= 0 || !transient) throw error;
      retries -= 1;
      // An expired tx is definitively dropped — resend immediately. The other
      // transient causes are state-propagation lag, which needs the pause.
      await new Promise((resolve) => setTimeout(resolve, /expired before landing/i.test(message) ? 1_000 : 5_000));
    }
  }
}

/**
 * Estimate gas for a full 8130 transaction body, padded 20%, floored by the
 * structural minimum so a pathological node under-estimate can't OOG-revert an
 * otherwise valid inclusion.
 */
async function estimateWithFloor(params: {
  sender: Address;
  accountChanges?: readonly unknown[];
  phases: Array<Array<{ to: Address; data: Hex }>>;
  payer?: Address;
}): Promise<bigint> {
  const wire = encodeWalletCalls({
    account: params.sender,
    calls: params.phases.map((phase) => phase.map((call) => ({ ...call, value: 0n }))),
  });
  let estimated: bigint | null = null;
  try {
    estimated = await estimateGas(sponsorClient, {
      sender: params.sender,
      ...(params.accountChanges ? { accountChanges: params.accountChanges as never } : {}),
      calls: wire,
      ...(params.payer ? { payer: params.payer } : {}),
    });
  } catch {
    estimated = null;
  }
  const floor = BigInt(
    estimateTxGas({
      mode: 'eip8130-native',
      deploy: Boolean(params.accountChanges),
      calls: params.phases.reduce((total, phase) => total + phase.length, 0),
      keyChanges: 0,
      fallback: estimated === null,
    }),
  );
  const padded = estimated === null ? floor : (estimated * 120n) / 100n;
  return padded > floor ? padded : floor;
}

/** Whether an error came from the sponsorship layer (worth a self-paid retry). */
function isPayerFailure(error: unknown): boolean {
  if (parsePayerError(error) !== undefined) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /payer|sponsor/i.test(message);
}

/**
 * The single transaction pipe for the demo's 8130 wallet. Gas is paid by, in
 * order of preference:
 * - `tokenGas` set → the demo's own in-browser ERC-8168 payer: phase-0 pays the
 *   payer a flat fee in the user's B20, the payer EOA's faucet ETH covers gas,
 *   and `payerAuth` is co-signed locally.
 * - otherwise the hosted payer sponsors it; if the sponsorship layer fails and
 *   the account holds seeded ETH, it falls back to paying its own gas.
 * The account deploys lazily: when the address has no code yet, the `create`
 * account-change rides along with the transaction.
 */
export async function sendSponsored8130(params: {
  wallet: StoredB20Wallet;
  deployment: Eip8130Deployment;
  calls: SponsoredCall[];
  /**
   * Explicit 2D nonce sequence. The public RPC is served by replicas whose
   * heads can differ, so the library's own nonce read may lag right after a
   * previous transaction — sequential flows must pin the nonce themselves.
   */
  nonceSequence?: number;
  /**
   * Skip the `eth_getCode` probe and treat the account as deployed. Needed
   * right after the deploying transaction: the code read lags inclusion by a
   * block, and re-attaching the create change to the next transaction makes
   * validation reject it.
   */
  assumeDeployed?: boolean;
  /** Pay gas in the user's token via the demo's local payer. */
  tokenGas?: TokenGasConfig;
}): Promise<SendResult> {
  const account = accountFor(params.wallet, params.deployment);
  // Deployment state must come from the chain, not local state — it decides
  // whether this tx carries the create change.
  const code = params.assumeDeployed
    ? '0x01'
    : await sponsorClient.getCode({ address: account.address }).catch(() => undefined);
  const deployed = typeof code === 'string' && code !== '0x';
  const accountChanges = deployed ? undefined : [account.create()];
  const calls = params.calls.map((call) => ({ ...call, value: 0n }));
  const seq = params.nonceSequence;

  if (params.tokenGas) {
    const { token, decimals, payer } = params.tokenGas;
    const payerSigner = privateKeyToAccount(payer.privateKey);
    const payerBalance = await getEthBalance(payerSigner.address);
    if (payerBalance === null || payerBalance < MIN_PAYER_ETH) {
      const seeded = await seedWithEth(payerSigner.address);
      if (!seeded) throw new Error('Could not fund the demo gas payer from the faucet. Try again in a minute.');
    }
    // ERC-8168 token payment: phase-0 pays the payer in the user's token,
    // phase-1 runs the real calls — both land atomically or not at all.
    const feeCall = {
      to: token,
      data: encodeFunctionData({ abi: transferAbi, functionName: 'transfer', args: [payerSigner.address, tokenGasFee(decimals)] }),
      value: 0n,
    };
    const phases = [[feeCall], calls];
    const gas = await estimateWithFloor({ sender: account.address, accountChanges, phases, payer: payerSigner.address });
    const hash = await confirmWithRetries(() =>
      sendCalls(sponsorClient, {
        account,
        ...(accountChanges ? { accountChanges: accountChanges as never } : {}),
        calls: phases,
        gas,
        ...(seq === undefined ? {} : { nonceSequence: BigInt(seq) }),
        payer: { account: payerSigner as never },
      }),
    );
    return { hash, mode: 'token' };
  }

  try {
    const hash = await confirmWithRetries(async () => {
      const result: unknown = await sendSponsoredCalls(sponsorClient, {
        account,
        payerClient,
        ...(accountChanges ? { accountChanges } : {}),
        ...(seq === undefined ? {} : { nonceSequence: seq }),
        calls,
        context: { flow: 'b20' },
      });
      // mode:"send" resolves with `{ transactionHash }` at runtime even though
      // the declared return type is a hex union — without this unwrap the
      // receipt poll fails with an opaque "invalid type: map, expected 32
      // bytes" RPC error.
      return typeof result === 'string' ? (result as Hex) : (result as { transactionHash: Hex }).transactionHash;
    });
    return { hash, mode: 'sponsored' };
  } catch (error) {
    // Sponsorship failed (budget, outage, decline). If the wallet holds the
    // faucet-seeded ETH, pay for the transaction itself instead.
    if (!isPayerFailure(error)) throw error;
    const balance = await getEthBalance(account.address);
    if (balance === null || balance < MIN_SELF_PAY_ETH) throw error;
    const phases = [calls];
    const gas = await estimateWithFloor({ sender: account.address, accountChanges, phases });
    const hash = await confirmWithRetries(() =>
      sendCalls(sponsorClient, {
        account,
        ...(accountChanges ? { accountChanges: accountChanges as never } : {}),
        calls: phases,
        gas,
        ...(seq === undefined ? {} : { nonceSequence: BigInt(seq) }),
      }),
    );
    return { hash, mode: 'self' };
  }
}

export type SponsoredBatch = { label: string; detail?: string; calls: SponsoredCall[] };

/**
 * Run several sponsored transactions in sequence, one per batch.
 *
 * The hosted payer's sponsorship budget covers only ~300k gas of execution per
 * transaction (its `maxCost` divided by the gas price) — heavier work has its
 * gas cut mid-phase and reverts, so flows like token deployment must be split
 * into transactions that each fit the budget. The wallet address and key are
 * created locally first; when that address has not been activated onchain yet,
 * a no-op transaction deploys it separately so account activation never shares
 * a sponsorship budget with the token deployment.
 *
 * Returns one tx hash per batch. Throws on the first failing batch; earlier
 * batches stay applied (callers should make batches individually meaningful).
 */
export async function sendSponsoredBatches(params: {
  wallet: StoredB20Wallet;
  deployment: Eip8130Deployment;
  batches: SponsoredBatch[];
  onProgress?: (batch: SponsoredBatch, index: number, total: number) => void;
  /** Fires as each batch confirms, with its tx result. */
  onBatchResult?: (batch: SponsoredBatch, result: SendResult) => void;
}): Promise<SendResult[]> {
  const { wallet, deployment, batches, onProgress, onBatchResult } = params;
  const address = walletAddress(wallet, deployment);
  const code = await sponsorClient.getCode({ address }).catch(() => undefined);
  const deployed = typeof code === 'string' && code !== '0x';
  const all: SponsoredBatch[] = deployed
    ? batches
    : [
        {
          label: 'Registering wallet',
          calls: [{ to: address, data: '0x' }],
        },
        ...batches,
      ];

  // The public RPC is served by replicas whose heads can differ, so a nonce
  // read taken right after a transaction may lag behind it. Read a few times,
  // keep the highest value, and assign each batch an explicit sequence from
  // there — never re-read mid-flow.
  let startCount = 0n;
  for (let i = 0; i < 3; i += 1) {
    const count = await getTransactionCount(sponsorClient, { address }).catch(() => null);
    if (count !== null && count > startCount) startCount = count;
  }

  const results: SendResult[] = [];
  for (const [index, batch] of all.entries()) {
    onProgress?.(batch, index, all.length);
    try {
      const result = await sendSponsored8130({
        wallet,
        deployment,
        calls: batch.calls,
        nonceSequence: Number(startCount) + index,
        // Once any batch confirmed, the account exists — the code probe
        // would lag a block and wrongly re-attach the create change.
        assumeDeployed: deployed || index > 0,
      });
      results.push(result);
      onBatchResult?.(batch, result);
    } catch (error) {
      throw new Error(
        `${batch.label} failed: ${payerErrorMessage(error) ?? (error instanceof Error ? error.message : String(error))}`,
      );
    }
  }
  return deployed ? results : results.slice(1);
}

/** Friendly message for payer rejections; `null` when the error is not one. */
export function payerErrorMessage(error: unknown): string | null {
  const rejected = parsePayerError(error);
  if (!rejected) return null;
  switch (rejected.code) {
    case 'BUDGET_EXHAUSTED':
    case 'SENDER_LIMIT_REACHED':
      return 'The gas sponsorship budget for this demo is used up. Wait a bit, then try again.';
    case 'TEMPORARILY_UNAVAILABLE':
      return 'The gas sponsor is temporarily unavailable. Try again in a moment.';
    default:
      return `The gas sponsor declined this transaction${rejected.reason ? `: ${rejected.reason}` : '.'}`;
  }
}
