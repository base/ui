'use client';

// The EIP-8130 account engine shared by every vibenet demo that transacts from
// local accounts (Account demo, B20, …): chain/network resolution, key +
// account CRUD, and the native-8130 signing/broadcast primitives. An account
// is a secp256k1 EOA: its key is the account.
//
// Keystore features (owners, session keys, policies, passkeys, sub-accounts)
// and EOA code delegation are intentionally not supported on vibenet right
// now; the prior implementation is in git history (main at cd24bff).
//
// Demo-specific UI (the Transact modal's calls builder and gas-mode picker)
// stays in each demo and calls into this engine's shared primitives
// (signComposed, broadcast8130, awaitInclusion). Error UI is owned by the
// Transact modal, not the engine, so nothing surfaces on the page behind it.

import {
  type AaCall,
  type Address,
  createPublicClient,
  encodeTokenTransfer,
  estimateGas,
  generatePrivateKey,
  getTransactionCount,
  getTransactionReceipt,
  type Hex,
  http,
  k1Authenticator,
  parseReceiptFields,
  privateKeyToAccount,
  type Signer,
  toEoaAccount,
  toHex,
  type TransactionSerializable8130,
} from '@aa';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { noncelessFields } from '../../library/aa';
import { vibenetApi } from '../../library/client';
import { ACCOUNT_RPC_URL, VIBENET_WS_URL } from '../../library/config';
import { type Inclusion, inclusionFromChain, type SendAnchor } from '../_shared/inclusion';
import {
  createReceiptWatcher,
  type RawReceipt,
  ReceiptTimeoutError,
  type ReceiptWatcher,
} from '../_shared/receiptWatcher';
import { connectJsonRpcStream } from '../validity/lib/stream';
import { estimateTxGas, getDemoChain } from './library/chains';
import { buildPhases, type CallRow, newCallRow, safeGasLimit, valueBearingCallCount } from './library/calls';
import type { StoredAccount } from './library/model';
import { requiredTokenAmount } from './library/payer';
import { type AaReceiptLike, aaReceiptSucceeded } from './library/receipt';
import { type Balances, KIND_LABEL, type Persisted, type WalletSigner } from './shared';
import { useAccounts } from './useAccounts';

const fundAccount = (address: Address) =>
  Promise.all([
    vibenetApi.faucet.drip({ address }),
    vibenetApi.faucet.dripUsdv({ address }),
  ]);

/** Best-effort human reason from a viem/RPC error (unwraps the "Missing or invalid
 *  parameters" boilerplate to the underlying details). */
function estimateFailureReason(err: unknown): string {
  const e = err as {
    shortMessage?: string;
    details?: string;
    message?: string;
    cause?: { shortMessage?: string; message?: string };
  };
  if (e && typeof e === 'object') {
    const short = e.shortMessage?.trim();
    const generic = short && /^Missing or invalid parameters/i.test(short);
    return (
      (generic ? e.details : short) ??
      e.details ??
      short ??
      e.cause?.shortMessage ??
      e.cause?.message ??
      e.message ??
      String(err)
    );
  }
  return String(err);
}

/** Collapse a giant viem error dump to its `Details:` line (or first line) for display. */
export function conciseError(message: string): string {
  const detail = message.match(/Details:\s*([\s\S]*?)(?:\s*Version:\s|$)/);
  if (detail?.[1]?.trim()) return detail[1].trim();
  const firstLine = message
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return firstLine ?? message;
}

/** True when a gas-estimate error means the node simply lacks the EIP-8130
 *  `eth_estimateGas` extension — the ONE case where silently falling back to the
 *  structural floor is still correct. Any OTHER estimate revert indicates the
 *  tx would actually fail, so it must be surfaced rather than swallowed. */
function isUnsupportedRpcError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: number;
    message?: string;
    shortMessage?: string;
    details?: string;
    cause?: { code?: number; message?: string };
  };
  if (e.code === -32601 || e.cause?.code === -32601) return true;
  const text = [e.message, e.shortMessage, e.details, e.cause?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    text.includes('method not found') ||
    text.includes('not whitelisted') ||
    text.includes('does not exist') ||
    text.includes('unsupported method') ||
    text.includes('method not supported')
  );
}

/** Thrown when a tx was broadcast but not confirmed before the timeout. */
export class TxPendingError extends Error {
  readonly txHash: Hex;
  constructor(hash: Hex) {
    super(`Transaction is pending — not yet included (${hash}).`);
    this.txHash = hash;
  }
}

/** Thrown when transaction composition is configured to stop on a reverting
 * gas estimate instead of silently broadcasting with a fallback gas limit. */
export class EstimateRevertedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Gas estimate failed — this transaction would revert: ${reason}`);
    this.reason = reason;
  }
}

/** ERC-8168 payer for a composed transaction. */
export type ComposePayer = {
  address: Address;
  /**
   * Phase-0 ERC-20 payment to the payer. With a `rate` (WAD token units per
   * wei) the amount is raised to cover the gas the transaction is signed with.
   */
  tokenPayment?: { token: Address; to: Address; amount: bigint; rate?: bigint | null };
  /**
   * Co-signs `payerAuth` inline with a key this browser holds (the B20 demo's
   * own faucet-funded payer EOA). Without it the tx is serialized with an empty
   * `payerAuth` for a hosted payer service to co-sign out of band.
   */
  localSigner?: Signer;
};

export type ComposeOptions = {
  rows: CallRow[];
  metadata?: Hex;
  /** Send nonce-free (expiring) instead of on the sequential nonce, valid for this many seconds. */
  noncelessSeconds?: number;
  payer?: ComposePayer;
  /** Upper validity bound (unix ms); a nonce-free send keeps the earlier of this and its own window. */
  validBefore?: bigint;
  fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  /** Never sign with less gas than this (a payer's `minGasLimit`). */
  minGas?: bigint;
  estimateRevert?: 'fallback' | 'throw' | 'force';
};

export type ComposedTransaction = {
  serialized: Hex;
  transaction: TransactionSerializable8130;
  /** The phase-0 token payment actually signed, when paying a payer in tokens. */
  paymentAmount?: bigint;
};

const DEFAULT_FEES = { maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1_000_000n };

// ---------------------------------------------------------------------------

function useAccountEngineCore() {
  const {
    signers,
    setSigners,
    accounts,
    setAccounts,
    activeAccountId,
    setActiveAccountId,
    activity,
    setActivity,
    networkShort,
    setNetworkShort,
    setGenesisHash,
    hydrated,
    addAccount,
    deleteAccount,
  } = useAccounts();

  const [busy, setBusy] = useState(false);
  const [faucetBusy, setFaucetBusy] = useState<string | null>(null);

  // Regenesis (devnet reset) detection.
  const [regenesisNotice, setRegenesisNotice] = useState(false);

  const chain = useMemo(() => getDemoChain(networkShort), [networkShort]);

  // A viem public client pointed at vibenet's cross-origin RPC route — reads
  // nonces / code / receipts and broadcasts native 8130 txs, plus the genesis hash.
  const makeRpcClient = useCallback(
    () =>
      createPublicClient({
        chain: {
          id: chain.id || 84538453,
          name: 'Vibenet',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: [ACCOUNT_RPC_URL] } },
        },
        transport: http(ACCOUNT_RPC_URL),
      }),
    [chain],
  );

  const acct = useMemo(() => accounts.find((a) => a.id === activeAccountId) ?? null, [accounts, activeAccountId]);
  const addressBook = useMemo(
    () => accounts.map((a) => ({ label: a.label, address: a.address })),
    [accounts],
  );

  const signerForAccount = useCallback(
    (a: StoredAccount): WalletSigner | null => signers.find((s) => s.id === a.signerId) ?? null,
    [signers],
  );
  const activeSigner = acct ? signerForAccount(acct) : null;

  // --- regenesis detection ----------------------------------------------
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const checkGenesis = async () => {
      let hash: string | null = null;
      try {
        const block = await makeRpcClient().getBlock({ blockNumber: 0n });
        hash = block.hash ?? null;
      } catch {
        return;
      }
      if (!hash || cancelled) return;
      setGenesisHash((prev) => {
        if (prev && prev !== hash) setRegenesisNotice(true);
        return hash;
      });
    };
    checkGenesis();
    const t = setInterval(checkGenesis, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [hydrated, makeRpcClient, setGenesisHash]);

  // --- helpers -----------------------------------------------------------
  // Entries that name a tx hash pick up its inclusion timing automatically, so
  // every surface's activity row can say which 200 ms block the tx landed in.
  const pushActivity = (e: Omit<Persisted['activity'][number], 'id' | 'ts'>) =>
    setActivity((prev) => [
      { id: crypto.randomUUID(), ts: Date.now(), ...inclusionFor(e.txHash), ...e },
      ...prev,
    ]);

  const refreshVibenetBalances = async (): Promise<Balances | null> => {
    if (!acct) return null;
    return vibenetApi.account.balances(acct.address, 'vibenet').catch(() => null);
  };

  const requestFaucet = async () => {
    if (!acct) return;
    setFaucetBusy('eth+usdv');
    try {
      // Capture the pre-drip balance as the baseline for the "did it credit?" poll.
      const before = await refreshVibenetBalances();
      const ethBefore = BigInt(before?.eth_wei ?? '0');
      await fundAccount(acct.address);
      const deadline = Date.now() + 8_000;
      let credited = false;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        const fresh = await refreshVibenetBalances();
        if (BigInt(fresh?.eth_wei ?? '0') > ethBefore) {
          credited = true;
          break;
        }
      }
      if (credited) {
        toast.success('Topped up successfully');
      } else {
        toast.error("Top up didn't go through — Vibenet may be down for maintenance. Please try again shortly.");
      }
    } catch {
      toast.error('Top up failed');
    } finally {
      setFaucetBusy(null);
    }
  };

  const autoFundNewAccount = (address: Address) => {
    void fundAccount(address)
      .then(() => toast.success('New account funded from the faucet'))
      .catch(() => toast.error('Auto top-up failed — use Top Up to retry'));
  };

  const nextSignerLabel = () => `${KIND_LABEL.k1} ${signers.length + 1}`;

  const createSigner = (): WalletSigner => {
    setBusy(true);
    try {
      const privateKey = generatePrivateKey();
      const ws: WalletSigner = {
        id: crypto.randomUUID(),
        kind: 'k1',
        label: nextSignerLabel(),
        privateKey,
        address: privateKeyToAccount(privateKey).address,
      };
      setSigners((prev) => [...prev, ws]);
      return ws;
    } finally {
      setBusy(false);
    }
  };

  // Signer ids backing an account. Keys outside this set are unused and safe to delete.
  const usedSignerIds = useMemo(() => new Set(accounts.map((a) => a.signerId)), [accounts]);

  // Drop an unused wallet key. The create modal owns its own selection state, so
  // it clears any reference to a just-deleted key itself.
  const deleteSigner = useCallback(
    (id: string) => {
      if (usedSignerIds.has(id)) return;
      setSigners((prev) => prev.filter((s) => s.id !== id));
    },
    [usedSignerIds, setSigners],
  );

  // Inclusion timing per broadcast hash, in chain time: which block (and which
  // 200 ms slot) each transaction landed in, and how many blocks after the
  // newest head this page had seen when it broadcast. Written by
  // awaitInclusion, read by pushActivity and by the surfaces' result views.
  // Refs, not state — looked up right after the await, never rendered from.
  const inclusions = useRef(new Map<Hex, Inclusion>());
  const sendAnchors = useRef(new Map<Hex, { anchor: SendAnchor | null; at: number }>());
  const inclusionFor = (txHash: Hex | undefined): Inclusion | undefined =>
    txHash ? inclusions.current.get(txHash) : undefined;

  // The block watcher: `newHeads` (the anchor a send is measured from, and each
  // block's Cobalt `timestampMs`) and `transactionReceipts` (the receipt the
  // moment its block is sealed) on one socket, with HTTP receipt polling when
  // the socket is down. Opened on mount so the anchor is warm by the first send.
  const watcher = useRef<ReceiptWatcher | null>(null);
  const makeWatcher = useCallback(
    () =>
      createReceiptWatcher({
        connect: () =>
          chain.shortName === 'vibenet' && VIBENET_WS_URL ? connectJsonRpcStream(VIBENET_WS_URL) : null,
        fetchReceipt: (hash) =>
          makeRpcClient().request({ method: 'eth_getTransactionReceipt', params: [hash] }) as Promise<RawReceipt | null>,
      }),
    [chain.shortName, makeRpcClient],
  );
  useEffect(() => {
    const w = makeWatcher();
    watcher.current = w;
    return () => {
      w.close();
      if (watcher.current === w) watcher.current = null;
    };
  }, [makeWatcher]);
  const ensureWatcher = (): ReceiptWatcher => {
    if (!watcher.current) watcher.current = makeWatcher();
    return watcher.current;
  };

  // Wait for a broadcast tx to be included and check that it — and every 8130
  // phase in it — succeeded. Throws TxPendingError if it is still not included
  // when the timeout runs out, a plain Error if anything reverted.
  const awaitInclusion = async (txHash: Hex, timeout = 30_000): Promise<Hex> => {
    const client = makeRpcClient();
    const w = ensureWatcher();
    // The receipt arrives on the socket the moment its block is sealed; over
    // HTTP it is polled every 100 ms. This is the whole wait the spinner shows.
    let pushed: RawReceipt;
    try {
      pushed = await w.waitForReceipt(txHash, { timeoutMs: timeout });
    } catch (err) {
      if (err instanceof ReceiptTimeoutError) throw new TxPendingError(txHash);
      throw err;
    }
    // Status and 8130 phase results come from the account RPC, whose replica
    // can trail the socket's node by a block: a few short retries, then the
    // pushed receipt itself.
    let receipt: (Record<string, unknown> & { eip8130: ReturnType<typeof parseReceiptFields> }) | null = null;
    for (let attempt = 0; attempt < 5 && !receipt; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 150));
      receipt = await getTransactionReceipt(client as never, { hash: txHash }).catch(() => null);
    }
    if (!receipt) receipt = { ...pushed, eip8130: parseReceiptFields(pushed) };
    if (!aaReceiptSucceeded(receipt as AaReceiptLike)) throw new Error(`Transaction reverted onchain (${txHash}).`);
    // Chain facts: the inclusion block's Cobalt `timestampMs`, from the head
    // stream when it has the block, else one block read. Timing is decoration,
    // so a failed read is dropped.
    const blockHash = receipt.blockHash as Hex;
    const head =
      w.headByHash(blockHash) ??
      ((await client
        .request({ method: 'eth_getBlockByHash', params: [blockHash, false] })
        .catch(() => null)) as { timestampMs?: Hex } | null);
    const inclusion = inclusionFromChain(
      receipt as { blockNumber?: unknown },
      head,
      sendAnchors.current.get(txHash)?.anchor ?? null,
    );
    if (inclusion) inclusions.current.set(txHash, inclusion);
    sendAnchors.current.delete(txHash);
    return txHash;
  };

  // Record the newest head this page has seen as the anchor a broadcast's
  // inclusion is measured from. Anchors outlive a pending timeout (a retry
  // re-awaits the same hash), so abandoned ones are swept here instead.
  const anchorSend = (txHash: Hex, anchor: SendAnchor | null) => {
    const now = Date.now();
    for (const [hash, mark] of sendAnchors.current) if (now - mark.at > 300_000) sendAnchors.current.delete(hash);
    sendAnchors.current.set(txHash, { anchor, at: now });
  };
  const latestAnchor = (): SendAnchor | null => {
    const latest = ensureWatcher().latestHead();
    return latest ? { number: latest.number, timestampMs: latest.timestampMs } : null;
  };

  // Broadcast a signed 8130 tx and wait for inclusion. Throws TxPendingError on
  // timeout (submitted but unconfirmed), a plain Error if any phase reverts.
  const broadcast8130 = async (signedTx: Hex, onStatus?: (s: 'submitting' | 'confirming') => void): Promise<Hex> => {
    const client = makeRpcClient();
    onStatus?.('submitting');
    // Read the anchor before the send leaves.
    const anchor = latestAnchor();
    const txHash = (await client.request({
      method: 'eth_sendRawTransaction',
      params: [signedTx],
    })) as Hex;
    anchorSend(txHash, anchor);
    onStatus?.('confirming');
    return awaitInclusion(txHash);
  };

  // Wait for a tx a hosted payer broadcast (`payer_sendTransaction`), measured
  // from the head seen when the request left.
  const awaitRelayed = async (txHash: Hex, anchor: SendAnchor | null): Promise<Hex> => {
    anchorSend(txHash, anchor);
    return awaitInclusion(txHash);
  };

  // Compose and sign one EOA transaction:
  // phases `[payerPayment?, userPhase0?, userPhase1]`, sequential or nonce-free
  // replay protection, and an optional payer.
  // Gas comes from the node's 8130 `eth_estimateGas` (priced with the exact
  // auth shapes), floored by the structural estimate.
  const signComposed = async (a: StoredAccount, opts: ComposeOptions): Promise<ComposedTransaction> => {
    const signerWS = signerForAccount(a);
    if (!signerWS) throw new Error(`No local key found for ${a.label}.`);
    const account = toEoaAccount(privateKeyToAccount(signerWS.privateKey));
    const client = makeRpcClient();
    const { rows, metadata, payer } = opts;

    const { phase0: userPhase0, phase1: userPhase1 } = buildPhases(rows, account.address);
    const userPhases: AaCall[][] = [...(userPhase0.length > 0 ? [userPhase0] : []), userPhase1];
    const phasesWith = (paymentAmount: bigint | undefined): AaCall[][] => {
      const payment = payer?.tokenPayment;
      if (!payment || paymentAmount === undefined) return userPhases;
      const transfer = encodeTokenTransfer({ token: payment.token, to: payment.to, amount: paymentAmount });
      return [[{ to: transfer.to, data: transfer.data }], ...userPhases];
    };

    const nonceless = opts.noncelessSeconds !== undefined ? noncelessFields(opts.noncelessSeconds) : null;
    const nonceKey = nonceless?.nonceKey ?? 0n;
    const nonceSequence =
      nonceless?.nonceSequence ?? (await getTransactionCount(client, { address: account.address, nonceKey }));
    const validBefore =
      nonceless && opts.validBefore !== undefined
        ? nonceless.validBefore < opts.validBefore
          ? nonceless.validBefore
          : opts.validBefore
        : (nonceless?.validBefore ?? opts.validBefore);
    const fees = opts.fees ?? DEFAULT_FEES;

    const totalCalls = userPhases.reduce((n, p) => n + p.length, 0);
    // Structural gas floor. `false` = realistic-with-headroom (a floor UNDER a
    // successful node estimate). `true` = 2x over-provision, used when no node
    // estimate is available so a send can't under-provision and OOG-revert —
    // unused gas is refunded.
    const floorGas = (fallback: boolean) =>
      BigInt(
        estimateTxGas({
          calls: totalCalls,
          valueCalls: valueBearingCallCount(rows, account.address),
          nonceless: !!nonceless,
          payer: !!payer,
          tokenPayment: !!payer?.tokenPayment,
          fallback,
        }),
      );

    let gasLimit: bigint;
    try {
      const estimated = await estimateGas(client, {
        sender: account.address,
        calls: phasesWith(payer?.tokenPayment?.amount),
        nonceKey,
        ...(validBefore !== undefined ? { validBefore } : {}),
        senderAuthAuthenticator: k1Authenticator,
        ...(payer ? { payer: payer.address, payerAuthAuthenticator: k1Authenticator } : {}),
        ...(metadata ? { dataSuffix: metadata } : {}),
      });
      gasLimit = safeGasLimit(estimated, Number(floorGas(false)));
    } catch (err) {
      if (isUnsupportedRpcError(err)) {
        // Node lacks the 8130 `eth_estimateGas` extension — floor is still correct.
        gasLimit = floorGas(true);
      } else if (opts.estimateRevert === 'force') {
        // User chose "Send anyway": price at a high ceiling so an under-estimate
        // isn't the cause of a revert. If it still reverts, it's a genuine logic
        // failure and the gas is spent (self-pay) / rejected (payer).
        gasLimit = BigInt(Math.max(Number(floorGas(true)) * 2, 2_000_000));
      } else if (opts.estimateRevert === 'throw') {
        throw new EstimateRevertedError(estimateFailureReason(err));
      } else {
        gasLimit = floorGas(true);
      }
    }
    if (opts.minGas !== undefined && gasLimit < opts.minGas) gasLimit = opts.minGas;

    // The binding price of a token offer is its rate at the signed gas and fee.
    let paymentAmount = payer?.tokenPayment?.amount;
    const rate = payer?.tokenPayment?.rate;
    if (paymentAmount !== undefined && rate) {
      const required = requiredTokenAmount(gasLimit, fees.maxFeePerGas, rate);
      if (required > paymentAmount) paymentAmount = required;
    }

    const transaction: TransactionSerializable8130 = {
      chainId: chain.id || 84538453,
      from: account.address,
      nonceKey,
      nonceSequence,
      ...(validBefore !== undefined ? { validBefore } : {}),
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      gas: gasLimit,
      calls: phasesWith(paymentAmount),
      ...(metadata ? { metadata } : {}),
      ...(payer ? { payer: payer.address } : {}),
    };
    const serialized = await account.signTransaction(
      transaction,
      payer?.localSigner ? { payer: { account: payer.localSigner, address: payer.address } } : undefined,
    );
    return { serialized, transaction, paymentAmount };
  };

  // Shared call path for account-backed demos outside the account transaction
  // builder (B20). `calls` land as one atomic EIP-8130 transaction, so a demo
  // can pair an approve with the call that spends it. `tokenGas` routes the
  // transaction through a caller-supplied ERC-8168 payer: phase 0 pays that
  // payer a flat fee in the given token and the payer's own ETH covers gas,
  // which is how a demo lets you pay fees in a token you just created. Without
  // it the account pays its own gas.
  const sendActiveCalls = async ({
    calls,
    tokenGas,
    metadata,
  }: {
    calls: { to: Address; data: Hex; value?: string }[];
    tokenGas?: { token: Address; decimals: number; payer: Signer; fee: bigint };
    /** Optional top-level signed app data attached to the transaction. */
    metadata?: string;
  }): Promise<{ hash: Hex; serialized: Hex; mode: 'self' | 'token'; inclusion?: Inclusion }> => {
    if (!acct) throw new Error('Select an account before you continue.');
    if (!calls.length) throw new Error('No calls to send.');
    const { serialized } = await signComposed(acct, {
      rows: calls.map((call) => newCallRow({ to: call.to, data: call.data, value: call.value ?? '0' })),
      metadata: metadata?.trim() ? toHex(metadata.trim()) : undefined,
      payer: tokenGas
        ? {
            address: tokenGas.payer.address,
            tokenPayment: { token: tokenGas.token, to: tokenGas.payer.address, amount: tokenGas.fee },
            localSigner: tokenGas.payer,
          }
        : undefined,
    });
    const hash = await broadcast8130(serialized);
    return { hash, serialized, mode: tokenGas ? 'token' : 'self', inclusion: inclusionFor(hash) };
  };

  return {
    // Store (useAccounts passthrough) + shared derivations
    signers,
    accounts,
    addAccount,
    activeAccountId,
    setActiveAccountId,
    addressBook,
    activity,
    networkShort,
    setNetworkShort,
    hydrated,
    deleteAccount,
    acct,

    // Chain
    chain,

    // Shared transient state
    busy,
    activeSigner,
    signerForAccount,
    regenesisNotice,
    setRegenesisNotice,

    // Faucet
    faucetBusy,
    requestFaucet,

    // Key + account-building primitives (used by CreateAccountModal)
    usedSignerIds,
    deleteSigner,
    createSigner,
    pushActivity,
    autoFundNewAccount,

    // Signing engine (also used by each surface's own Transact flow)
    latestAnchor,
    broadcast8130,
    awaitRelayed,
    awaitInclusion,
    inclusionFor,
    signComposed,
    sendActiveCalls,
  };
}

// Shared instance handed down via context so components read only what they
// need instead of receiving a giant `engine` prop.
const AccountEngineContext = createContext<AccountEngineCore | null>(null);

export function AccountEngineProvider({ children }: { children: ReactNode }) {
  const engine = useAccountEngineCore();
  return <AccountEngineContext.Provider value={engine}>{children}</AccountEngineContext.Provider>;
}

export function useAccountEngine(): AccountEngineCore {
  const ctx = useContext(AccountEngineContext);
  if (!ctx) throw new Error('useAccountEngine must be used within an <AccountEngineProvider>.');
  return ctx;
}

export type AccountEngineCore = ReturnType<typeof useAccountEngineCore>;
