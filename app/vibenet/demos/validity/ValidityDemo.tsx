'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEther, type Hex, type PublicClient } from 'viem';

import { trackValidityOrder } from '../../../analytics/events';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Text } from '../../../components/ui/Text';
import { CopyableValue } from '../../components/CopyableValue';
import { AccountDemoShell } from '../_components/AccountDemoShell';
import { AnimatedAmount } from '../_components/AnimatedAmount';
import { DemoHeader } from '../_components/DemoHeader';
import { newCallRow } from '../account/library/calls';
import { ActivityLog } from '../account/components/ActivityLog';
import { AccountEngineProvider, useAccountEngine } from '../account/useAccountEngine';
import { VIBENET_EXPLORER_PATH } from '../../library/config';
import { CallRow } from '../_shared/CallRow';
import { ChevronIcon } from '../_shared/dropdown';
import { TransactionModal, type TxStep } from '../_shared/TransactionModal';
import { OrderList } from './components/OrderList';
import { OrderTicket } from './components/OrderTicket';
import { PriceCandles, type FillMark, type PriceLevel, type PriceSample } from './components/PriceCandles';
import { ValidityJson } from './components/ValidityJson';
import {
  amountInForVibe,
  amountOutAtLimit,
  encodeHelperSwap,
  fillQuoteFromPairLogs,
  fillQuoteFromSwapReceipt,
  getReserves,
  helperApproveCalls,
  inventoryMints,
  reservesFromSyncLog,
  tokenBalance,
} from './lib/amm';
import { clampNoncelessExpiry, noncelessFields } from '../../library/aa';
import {
  CANDLE_SAMPLE_MS,
  MAX_EXPIRY_SECONDS,
  MAX_NONCELESS_SECONDS,
  TRADE_VIBE,
} from './lib/constants';
import { VibenetApiError } from '../../library/client';
import { VIBENET_WS_URL } from '../../library/config';
import {
  ageRestoredOrders,
  maxBlockForExpiry,
  occupyingOrder,
  orderBlockExpired,
  orderWallClockExpired,
  restingOrderToReplace,
} from './lib/orders';
import { bumpReplacementFees, feesFromHead, isReplacementUnderpriced, padFees } from './lib/fees';
import { reviewClauses } from './lib/annotate';
import { applyOffsetBps, blockExpiryPredicate, formatPrice, priceValidity } from './lib/predicates';
import {
  ammPriceFromQuote,
  ammSide,
  clampToCondition,
  formatTokenAmount,
  quoteWad,
  swapOuts,
  tokenInFor,
  USDV_DECIMALS,
  USDV_SYMBOL,
  vibeIsToken0,
  VIBE_SYMBOL,
} from './lib/quote';
import {
  describeValidityError,
  fetchTape,
  makePublicClient,
  publishTape,
  sendValidityTransaction,
  VIBENET_CHAIN,
  type RpcSend,
} from './lib/rpc';
import { connectJsonRpcStream, headNumber, type StreamHead, type StreamLog } from './lib/stream';
import { probeSingleton } from './lib/singleton';
import { mergeTape } from './lib/tape';
import { createState, loadState, saveState, type StoredState } from './lib/store';
import type { PlacedOrder, Rectangle, Reserves, Side, SubmitMode } from './lib/types';

/** HTTP fallback when the read host has no `/ws`. Submit is always HTTP.
 *  The socket carries heads, pair logs, and remaining reads (balances, receipts). */
const SYNC_MS = 1_000;
const BALANCE_MS = 5_000;

function wadToNumber(wad: bigint): number {
  return Number(wad) / 1e18;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ValidityDemo() {
  return (
    <AccountEngineProvider>
      <ValidityDemoInner />
    </AccountEngineProvider>
  );
}

function ValidityDemoInner() {
  const engine = useAccountEngine();
  const acct = engine.acct;

  const [genesisHash, setGenesisHash] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [state, setState] = useState<StoredState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [vibeBalance, setVibeBalance] = useState<bigint | null>(null);
  const [usdvBalance, setUsdvBalance] = useState<bigint | null>(null);
  const [reserves, setReserves] = useState<Reserves | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [txStep, setTxStep] = useState<TxStep>('review');
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [side, setSide] = useState<Side>('buy');
  const [offsetBps, setOffsetBps] = useState(100);
  const [expirySeconds, setExpirySeconds] = useState(15);
  const [submitMode, setSubmitMode] = useState<SubmitMode>('concurrent');
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const [samples, setSamples] = useState<PriceSample[]>([]);
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [streamLive, setStreamLive] = useState(false);

  const publicRef = useRef<PublicClient | null>(null);
  const rpcSendRef = useRef<RpcSend | null>(null);
  const headFeesRef = useRef<ReturnType<typeof feesFromHead>>(null);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const refreshBalancesRef = useRef<() => void>(() => {});

  const ordersRef = useRef<PlacedOrder[]>([]);
  ordersRef.current = orders;
  const reservesRef = useRef<Reserves | null>(null);
  reservesRef.current = reserves;
  const samplesRef = useRef<PriceSample[]>([]);
  samplesRef.current = samples;
  const stateRef = useRef<StoredState | null>(null);
  stateRef.current = state;

  const persist = useCallback((next: StoredState) => {
    const stored = { ...next, orders: next.orders ?? ordersRef.current };
    saveState(stored);
    setState(stored);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const current = stateRef.current;
    if (!current) return;
    const stored = { ...current, orders };
    saveState(stored);
    stateRef.current = stored;
  }, [hydrated, orders]);

  const pushSample = useCallback((price: number) => {
    if (!Number.isFinite(price) || price <= 0) return;
    setSamples((prev) => mergeTape(prev, [{ t: Date.now(), price }]));
  }, []);

  useEffect(() => {
    const stamp = () => {
      const current = reservesRef.current;
      const deployment = stateRef.current?.deployment;
      if (!current || !deployment) return;
      const quote = quoteWad(current.reserve0, current.reserve1, vibeIsToken0(deployment));
      pushSample(Number(quote) / 1e18);
    };
    let interval: number | undefined;
    const delay = CANDLE_SAMPLE_MS - (Date.now() % CANDLE_SAMPLE_MS);
    const timeout = window.setTimeout(() => {
      stamp();
      interval = window.setInterval(stamp, CANDLE_SAMPLE_MS);
    }, delay);
    stamp();
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [pushSample]);

  const pair = state?.deployment?.pair;
  const tapeVibeToken0 = Boolean(state?.deployment && vibeIsToken0(state.deployment));

  useEffect(() => {
    if (!hydrated || !pair) return;
    let cancelled = false;
    void fetchTape(pair, tapeVibeToken0)
      .then((remote) => {
        if (cancelled || remote.length === 0) return;
        setSamples((prev) => mergeTape(remote, prev));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hydrated, pair, tapeVibeToken0]);

  useEffect(() => {
    if (!hydrated || !pair) return;
    const flush = () => {
      void publishTape(pair, samplesRef.current).catch(() => {});
    };
    const id = window.setInterval(flush, 2_000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [hydrated, pair]);

  useEffect(() => {
    let cancelled = false;
    const client = makePublicClient(() => rpcSendRef.current);
    publicRef.current = client;
    void (async () => {
      try {
        const genesis = await client.getBlock({ blockNumber: 0n });
        const hash = genesis.hash;
        if (!hash) throw new Error('RPC did not return a genesis hash.');
        if (cancelled) return;
        setGenesisHash(hash);
        const existing = loadState();
        const sameChain = Boolean(
          existing && existing.chainId === VIBENET_CHAIN.id && existing.genesisHash === hash,
        );
        const base = sameChain && existing ? existing : createState(VIBENET_CHAIN.id, hash);
        const restored = sameChain ? ageRestoredOrders(existing?.orders ?? []) : [];
        ordersRef.current = restored;
        setOrders(restored);
        try {
          const live = await probeSingleton(client);
          if (cancelled) return;
          persist({ ...base, orders: restored, deployment: live ?? undefined });
        } catch {
          if (!cancelled) persist({ ...base, orders: restored });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStatusError(err instanceof Error ? err.message : 'Could not reach the Vibenet RPC.');
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const patchOrders = useCallback((patch: (order: PlacedOrder) => PlacedOrder) => {
    let changed = false;
    const next = ordersRef.current.map((order) => {
      const updated = patch(order);
      if (updated !== order) changed = true;
      return updated;
    });
    if (!changed) return;
    ordersRef.current = next;
    setOrders(next);
  }, []);

  const expireOrders = useCallback(
    (block: bigint | null) => {
      const now = Date.now();
      const wallExpired = ordersRef.current.filter((order) => orderWallClockExpired(order, now));
      if (wallExpired.length > 0) {
        const ids = new Set(wallExpired.map((order) => order.id));
        patchOrders((item) =>
          ids.has(item.id) && item.status === 'pending' ? { ...item, status: 'expired' } : item,
        );
        for (const order of wallExpired) trackValidityOrder(order.side, 'expired');
      }
      if (block === null) return;
      const blockExpired = ordersRef.current.filter((order) => orderBlockExpired(order, block));
      if (blockExpired.length === 0) return;
      const ids = new Set(blockExpired.map((order) => order.id));
      patchOrders((item) =>
        ids.has(item.id) && item.status === 'pending' ? { ...item, status: 'expired' } : item,
      );
      for (const order of blockExpired) trackValidityOrder(order.side, 'expired');
    },
    [patchOrders],
  );

  const markOrderLanded = useCallback(
    (txHash: Hex, filled: boolean, fillPriceWad?: bigint, includedAt?: number) => {
      const wanted = txHash.toLowerCase();
      const order = ordersRef.current.find((item) => item.txHash?.toLowerCase() === wanted);
      if (!order || (order.status !== 'pending' && order.status !== 'expired')) return;
      const filledAt = filled ? (includedAt ?? Date.now()) : undefined;
      const clamped = filled
        ? clampToCondition(order.side, fillPriceWad ?? order.targetPriceWad, order.targetPriceWad)
        : undefined;
      const wasPending = order.status === 'pending';
      patchOrders((item) =>
        item.id === order.id
          ? {
              ...item,
              status: filled ? 'filled' : 'error',
              filledAt: filled ? (item.filledAt ?? filledAt) : item.filledAt,
              fillPriceWad: filled ? (item.fillPriceWad ?? clamped) : item.fillPriceWad,
            }
          : item,
      );
      if (filled) {
        trackValidityOrder(order.side, 'filled');
        refreshBalancesRef.current();
      } else if (wasPending) trackValidityOrder(order.side, 'error');
    },
    [patchOrders],
  );

  const applyReceipts = useCallback(
    async (client: PublicClient, pending: PlacedOrder[], block: bigint | null) => {
      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
        new Promise((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('rpc timeout')), ms);
          promise.then(
            (value) => {
              window.clearTimeout(timer);
              resolve(value);
            },
            (err: unknown) => {
              window.clearTimeout(timer);
              reject(err);
            },
          );
        });

      const receipts = await Promise.all(
        pending.map((order) =>
          order.txHash
            ? withTimeout(client.getTransactionReceipt({ hash: order.txHash }), 2_500).catch(() => null)
            : Promise.resolve(null),
        ),
      );
      const deployment = stateRef.current?.deployment;
      const vibeToken0Now = Boolean(deployment && vibeIsToken0(deployment));

      for (let i = 0; i < pending.length; i += 1) {
        const order = pending[i];
        const receipt = receipts[i];
        if (!receipt || !order.txHash) continue;
        const filled = receipt.status === 'success';
        const observed = filled && deployment
          ? fillQuoteFromSwapReceipt(receipt, deployment.pair, vibeToken0Now)
          : undefined;
        markOrderLanded(order.txHash, filled, observed);
      }
      expireOrders(block);
    },
    [expireOrders, markOrderLanded],
  );

  useEffect(() => {
    if (!hydrated || !acct || !genesisHash) return;
    const client = publicRef.current;
    if (!client) return;
    let cancelled = false;
    let inFlight = false;
    let pollId: number | undefined;
    let balanceId: number | undefined;
    let stream: ReturnType<typeof connectJsonRpcStream> | undefined;
    const logsByTx = new Map<string, StreamLog[]>();

    const pullBalances = async (includeReserves: boolean) => {
      const deployment = stateRef.current?.deployment;
      const jobs: Promise<unknown>[] = [client.getBalance({ address: acct.address })];
      if (includeReserves) {
        jobs.push(deployment ? getReserves(client, deployment.pair).catch(() => null) : Promise.resolve(null));
      }
      if (deployment) {
        jobs.push(tokenBalance(client, deployment.tokenA, acct.address).catch(() => null));
        jobs.push(tokenBalance(client, deployment.tokenB, acct.address).catch(() => null));
      }
      const [eth, ...rest] = await Promise.all(jobs);
      if (cancelled) return;
      if (typeof eth === 'bigint') setEthBalance(eth);
      let offset = 0;
      if (includeReserves) {
        const latestReserves = rest[offset];
        offset += 1;
        if (latestReserves && deployment) {
          setReserves(latestReserves as Reserves);
        }
      }
      if (deployment) {
        const vibe = rest[offset];
        const usdv = rest[offset + 1];
        offset += 2;
        if (typeof vibe === 'bigint') setVibeBalance(vibe);
        if (typeof usdv === 'bigint') setUsdvBalance(usdv);
      }
    };
    refreshBalancesRef.current = () => {
      void pullBalances(false).catch(() => {});
    };

    const pollTick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const pending = pendingWithHash();
        const block = await client.getBlockNumber({ cacheTime: 0 });
        if (cancelled) return;
        setBlockNumber((prev) => (prev === block ? prev : block));
        await pullBalances(true);
        if (pending.length > 0) await applyReceipts(client, pending, block);
      } catch {
        // keep last snapshot
      } finally {
        inFlight = false;
      }
    };

    const pendingWithHash = () =>
      ordersRef.current.filter(
        (order) => order.txHash && (order.status === 'pending' || order.status === 'expired'),
      );

    const stopBalances = () => {
      if (balanceId === undefined) return;
      window.clearInterval(balanceId);
      balanceId = undefined;
    };

    const startPoll = () => {
      if (pollId !== undefined) return;
      stopBalances();
      rpcSendRef.current = null;
      setStreamLive(false);
      void pollTick();
      pollId = window.setInterval(() => {
        void pollTick();
      }, SYNC_MS);
    };

    const handleLog = (raw: unknown) => {
      const log = raw as StreamLog;
      if (!log?.address || !log.topics?.length || !log.data) return;
      const deployment = stateRef.current?.deployment;
      if (!deployment) return;
      const tx = log.transactionHash?.toLowerCase();
      const pending = tx
        ? ordersRef.current.find(
            (order) =>
              order.txHash?.toLowerCase() === tx && (order.status === 'pending' || order.status === 'expired'),
          )
        : undefined;
      if (tx && pending) {
        const bucket = logsByTx.get(tx) ?? [];
        bucket.push(log);
        logsByTx.set(tx, bucket);
        if (bucket.length > 8) logsByTx.delete(tx);
      }
      const sync = reservesFromSyncLog(log);
      if (sync) {
        setReserves(sync);
        const quote = quoteWad(sync.reserve0, sync.reserve1, vibeIsToken0(deployment));
        pushSample(Number(quote) / 1e18);
      }
      if (!tx || !pending) return;
      const observed = fillQuoteFromPairLogs(logsByTx.get(tx) ?? [log], deployment.pair, vibeIsToken0(deployment));
      if (observed === undefined) return;
      logsByTx.delete(tx);
      markOrderLanded(pending.txHash!, true, observed);
    };

    const startStream = async (wsUrl: string) => {
      stream = connectJsonRpcStream(wsUrl);
      stream.setOnClose(() => {
        rpcSendRef.current = null;
        if (!cancelled) startPoll();
      });
      await stream.ready;
      rpcSendRef.current = (method, params) => stream!.request(method, params);
      let lastReceiptAt = 0;
      await stream.subscribe(['newHeads'], (raw) => {
        const head = raw as StreamHead;
        const number = headNumber(head);
        const fees = feesFromHead(head);
        if (fees) headFeesRef.current = fees;
        if (number === null) return;
        setBlockNumber((prev) => (prev === number ? prev : number));
        expireOrders(number);
        const pending = pendingWithHash();
        if (pending.length === 0 || Date.now() - lastReceiptAt < SYNC_MS) return;
        lastReceiptAt = Date.now();
        void applyReceipts(client, pending, number).catch(() => {});
      });
      const pair = stateRef.current?.deployment?.pair;
      if (pair) {
        await stream.subscribe(['logs', { address: pair }], handleLog);
      }
      if (cancelled) {
        stream.close();
        return;
      }
      setStreamLive(true);
      void pullBalances(true);
      balanceId = window.setInterval(() => {
        void pullBalances(false).catch(() => {});
      }, BALANCE_MS);
    };

    if (VIBENET_WS_URL) {
      void startStream(VIBENET_WS_URL).catch(() => {
        rpcSendRef.current = null;
        stream?.close();
        if (!cancelled) startPoll();
      });
    } else {
      startPoll();
    }

    return () => {
      cancelled = true;
      rpcSendRef.current = null;
      if (pollId !== undefined) window.clearInterval(pollId);
      if (balanceId !== undefined) window.clearInterval(balanceId);
      stream?.close();
      setStreamLive(false);
    };
  }, [acct, applyReceipts, expireOrders, genesisHash, hydrated, markOrderLanded, pushSample, state?.deployment?.pair]);

  const vibeToken0 = Boolean(state?.deployment && vibeIsToken0(state.deployment));
  const k = reserves ? reserves.reserve0 * reserves.reserve1 : 0n;
  const spot = reserves && state?.deployment
    ? quoteWad(reserves.reserve0, reserves.reserve1, vibeToken0)
    : 0n;
  const draft = useMemo(() => {
    if (!state?.deployment || k === 0n || spot === 0n) return null;
    try {
      const price = applyOffsetBps(spot, side, offsetBps);
      const ammPrice = ammPriceFromQuote(price, vibeToken0);
      const built = priceValidity(state.deployment.pair, k, ammPrice, ammSide(side, vibeToken0));
      return {
        priceWad: price,
        side,
        offsetBps,
        rectangle: built.rectangle as Rectangle,
        predicates: built.predicates,
      };
    } catch {
      return null;
    }
  }, [k, offsetBps, side, spot, state?.deployment, vibeToken0]);

  const reviewPredicates = useMemo(() => {
    if (!draft) return [];
    if (blockNumber === null) return draft.predicates;
    const seconds =
      submitMode === 'concurrent'
        ? clampNoncelessExpiry(expirySeconds)
        : Math.min(MAX_EXPIRY_SECONDS, expirySeconds);
    const maxBlock = maxBlockForExpiry(blockNumber, seconds);
    return [...draft.predicates, blockExpiryPredicate(maxBlock)];
  }, [blockNumber, draft, expirySeconds, submitMode]);

  const chartLevels = useMemo((): PriceLevel[] => {
    const levels: PriceLevel[] = [];
    if (draft) {
      levels.push({
        id: 'draft',
        price: wadToNumber(draft.priceWad),
        side: draft.side,
        kind: 'draft',
      });
    }
    for (const order of orders) {
      if (order.status !== 'pending' && order.id !== hoveredOrderId) continue;
      levels.push({
        id: order.id,
        price: wadToNumber(order.targetPriceWad),
        side: order.side,
        kind: 'resting',
        highlighted: order.id === hoveredOrderId,
      });
    }
    return levels;
  }, [draft, hoveredOrderId, orders]);

  const fillMarks = useMemo((): FillMark[] => {
    const marks: FillMark[] = [];
    for (const order of orders) {
      if (order.status !== 'filled' || order.filledAt === undefined) continue;
      const price = wadToNumber(order.fillPriceWad ?? order.targetPriceWad);
      if (!Number.isFinite(price) || price <= 0) continue;
      marks.push({
        id: order.id,
        t: order.filledAt,
        price,
        target: wadToNumber(order.targetPriceWad),
        side: order.side,
        highlighted: order.id === hoveredOrderId,
      });
    }
    return marks;
  }, [hoveredOrderId, orders]);

  const fund = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setProgress('Requesting ETH from the faucet');
      await engine.requestFaucet();
    } catch (err) {
      setError(
        err instanceof VibenetApiError && err.status === 429
          ? 'Faucet rate limited — wait a minute and try again.'
          : err instanceof Error
            ? err.message
            : 'Faucet request failed.',
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [engine]);

  const inventoryKeyRef = useRef('');

  // Mint USDV inventory + approve the helper for the user's own account so
  // their conditional orders can fill. The pool itself and the maker flow are
  // now run centrally by the vibenet actor system, so there is no client-side
  // maker creation, funding, or swap loop here anymore.
  useEffect(() => {
    if (!hydrated || !state?.deployment || !acct || busy) return;
    if (!ethBalance || ethBalance === 0n) return;
    const client = publicRef.current;
    if (!client) return;
    const key = `${state.deployment.pair}:${acct.id}`;
    if (inventoryKeyRef.current === key) return;
    const deployment = state.deployment;
    let cancelled = false;
    void (async () => {
      try {
        const starter = await inventoryMints(client, deployment, [{ to: acct.address }]);
        const approves = await helperApproveCalls(client, deployment, acct.address);
        if (cancelled) return;
        if (starter.length + approves.length === 0) {
          inventoryKeyRef.current = key;
          return;
        }
        setProgress('Minting USDV inventory');
        await engineRef.current.sendActiveCalls({
          calls: [...starter, ...approves],
          metadata: 'Validity inventory',
        });
        if (!cancelled) inventoryKeyRef.current = key;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not mint inventory');
      } finally {
        if (!cancelled) setProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [acct, busy, ethBalance, hydrated, state?.deployment]);

  const placeOrder = async (): Promise<Hex | undefined> => {
    if (!draft || !acct || !state?.deployment || !reserves || !engine.activeSigner) return;
    const publicClient = publicRef.current;
    if (!publicClient) return;
    setBusy(true);
    setError(null);
    const side: Side = draft.side;
    const tokenIn = tokenInFor(state.deployment, side === 'sell');
    try {
      const amountIn = amountInForVibe(TRADE_VIBE, side, k, draft.priceWad);
      if (amountIn === 0n) throw new Error('Swap size is too small.');
      const inventory = await tokenBalance(publicClient, tokenIn, acct.address);
      if (inventory < amountIn) {
        throw new Error(
          side === 'sell'
            ? `Need ${formatTokenAmount(TRADE_VIBE)} ${VIBE_SYMBOL} to sell.`
            : `Need ${formatTokenAmount(amountIn, USDV_DECIMALS)} ${USDV_SYMBOL} to buy ${formatTokenAmount(TRADE_VIBE)} ${VIBE_SYMBOL}.`,
        );
      }
      const outExact = amountOutAtLimit(amountIn, side, k, draft.priceWad);
      const out = outExact > 1n ? outExact - 1n : outExact;
      if (out === 0n) throw new Error('Swap size is too small.');
      const { amount0Out, amount1Out } = swapOuts({
        vibeToken0,
        sellVibe: side === 'sell',
        amountOut: out,
      });
      const call = encodeHelperSwap({
        helper: state.deployment.helper,
        tokenIn,
        pair: state.deployment.pair,
        amountIn,
        amount0Out,
        amount1Out,
      });
      const seconds =
        submitMode === 'concurrent'
          ? clampNoncelessExpiry(expirySeconds)
          : Math.min(MAX_EXPIRY_SECONDS, expirySeconds);
      const block = blockNumber ?? (await publicClient.getBlockNumber({ cacheTime: 0 }));
      const maxBlock = maxBlockForExpiry(block, seconds);
      const validity = [...draft.predicates, blockExpiryPredicate(maxBlock)];
      const fromHead = headFeesRef.current;
      const estimated =
        fromHead ??
        (await publicClient.estimateFeesPerGas().catch(() => null));
      const padded =
        estimated?.maxFeePerGas !== undefined && estimated.maxPriorityFeePerGas !== undefined
          ? padFees({
              maxFeePerGas: estimated.maxFeePerGas,
              maxPriorityFeePerGas: estimated.maxPriorityFeePerGas,
            })
          : null;
      trackValidityOrder(side, 'submitted');
      let hash: Hex;
      let nonce: number | undefined;
      let fees = padded;
      let replaced: ReturnType<typeof restingOrderToReplace>;
      const rows = [newCallRow({ to: call.to, data: call.data, value: '0' })];
      if (submitMode === 'concurrent') {
        replaced = undefined;
        const fields = noncelessFields(seconds);
        const { serialized } = await engine.signComposed(
          acct,
          engine.activeSigner,
          rows,
          [],
          null,
          undefined,
          undefined,
          undefined,
          {
            nonceKey: fields.nonceKey,
            nonceSequence: 0n,
            validBefore: fields.validBefore,
            maxFeePerGas: padded?.maxFeePerGas,
            maxPriorityFeePerGas: padded?.maxPriorityFeePerGas,
          },
        );
        hash = await sendValidityTransaction(serialized, validity);
      } else {
        const confirmedNonce = Number(
          await publicClient.getTransactionCount({
            address: acct.address,
            blockTag: 'latest',
          }),
        );
        const occupant = occupyingOrder(ordersRef.current, confirmedNonce);
        replaced = restingOrderToReplace(ordersRef.current, confirmedNonce);
        if (occupant?.maxFeePerGas !== undefined && occupant.maxPriorityFeePerGas !== undefined) {
          fees = bumpReplacementFees(
            {
              maxFeePerGas: occupant.maxFeePerGas,
              maxPriorityFeePerGas: occupant.maxPriorityFeePerGas,
            },
            padded,
          );
        }
        const sign = (nextFees: typeof fees) =>
          engine.signComposed(acct, engine.activeSigner!, rows, [], null, undefined, undefined, undefined, {
            nonceSequence: BigInt(confirmedNonce),
            maxFeePerGas: nextFees?.maxFeePerGas,
            maxPriorityFeePerGas: nextFees?.maxPriorityFeePerGas,
          });
        let signedResult = await sign(fees);
        try {
          hash = await sendValidityTransaction(signedResult.serialized, validity);
        } catch (err) {
          if (!isReplacementUnderpriced(err) || !fees) throw err;
          fees = bumpReplacementFees(fees, padded);
          signedResult = await sign(fees);
          hash = await sendValidityTransaction(signedResult.serialized, validity);
        }
        nonce = confirmedNonce;
      }
      const order: PlacedOrder = {
        id: newId(),
        side,
        targetPriceWad: draft.priceWad,
        size: TRADE_VIBE,
        expirySeconds: seconds,
        submitMode,
        maxBlock,
        submittedAt: Date.now(),
        txHash: hash,
        nonce,
        maxFeePerGas: fees?.maxFeePerGas,
        maxPriorityFeePerGas: fees?.maxPriorityFeePerGas,
        status: 'pending',
        rectangle: draft.rectangle,
        validity,
      };
      setOrders((prev) => {
        const next = replaced
          ? prev.map((item) =>
              item.id === replaced.id && item.status === 'pending'
                ? { ...item, status: 'replaced' as const }
                : item,
            )
          : prev;
        return [order, ...next];
      });
      if (replaced) trackValidityOrder(replaced.side, 'replaced');
      engine.pushActivity({
        kind: 'transact',
        title: `Validity ${side} submitted`,
        detail: submitMode === 'concurrent' ? '8130 concurrent' : '8130 replace',
        account: acct.address,
        txHash: hash,
        network: engine.chain.name,
        mode: engine.chain.mode,
      });
      return hash;
    } catch (err) {
      const message = describeValidityError(err);
      setError(message);
      trackValidityOrder(side, 'error');
      setOrders((prev) => [
        {
          id: newId(),
          side,
          targetPriceWad: draft.priceWad,
          size: 0n,
          expirySeconds,
          submittedAt: Date.now(),
          status: 'error',
          error: message,
          rectangle: draft.rectangle,
          validity: draft.predicates,
        },
        ...prev,
      ]);
    } finally {
      setBusy(false);
    }
  };

  const address = acct?.address;
  const deployed = Boolean(state?.deployment);
  const tradeLabel = formatTokenAmount(TRADE_VIBE);
  const canAffordTrade = (() => {
    if (!draft) return false;
    if (side === 'sell') return (vibeBalance ?? 0n) >= TRADE_VIBE;
    if (k === 0n) return false;
    const need = amountInForVibe(TRADE_VIBE, 'buy', k, draft.priceWad);
    return need > 0n && (usdvBalance ?? 0n) >= need;
  })();

  return (
    <AccountDemoShell
      activity={<ActivityLog activity={engine.activity} accounts={engine.accounts} />}
      activityCount={engine.activity.length}
      activityEmptyMessage="Nothing has happened yet."
    >
      {!hydrated || !engine.hydrated ? (
        <div className="py-20" />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-10 pb-16 text-foreground">
      <DemoHeader
        eyebrow="Validity · experimental"
        title="Send now. Land later."
        description="A transaction can carry predicates the sequencer checks before inclusion. Everyone shares one VIBE/USDV pool — VIBE is a B20, USDV is the faucet stablecoin — so you can watch a swap wait for a price condition, then land or expire."
      />

      {statusError ? (
        <Card className="bg-background p-4 text-bds-orange-50 dark:bg-white/5">{statusError}</Card>
      ) : null}

      {!deployed ? (
        <Card className="flex flex-col gap-4 bg-background p-6 dark:bg-white/5">
          <Text variant="title3">Shared pool</Text>
          <Text variant="label.regular" tone="muted">
            The shared VIBE/USDV pool (VIBE is a B20, USDV is the faucet
            stablecoin) runs on Vibenet infrastructure — a central actor system
            keeps a live market moving. It’s coming online; this page will fill
            in automatically. Meanwhile, top up your account so you’re ready to
            place a conditional order.
          </Text>
          {address ? (
            <div className="flex items-center justify-between gap-3">
              <Text variant="label" tone="muted">
                Address
              </Text>
              <CopyableValue value={address} />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <Text variant="label" tone="muted">
              ETH
            </Text>
            <Text variant="label.mono">{ethBalance === null ? '…' : formatEther(ethBalance)}</Text>
          </div>
          {error ? <Text variant="footnote" className="text-bds-orange-50">{error}</Text> : null}
          {progress ? <Text variant="footnote" tone="muted">{progress}</Text> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void fund()} disabled={busy || !address || engine.faucetBusy !== null}>
              {engine.faucetBusy ? 'Topping up…' : 'Top up'}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-10">
          <div className="flex min-w-0 flex-col gap-3">
              <PriceCandles samples={samples} levels={chartLevels} fills={fillMarks} />
            <Text variant="footnote" tone="muted">
              Spot {spot === 0n ? '—' : `$${formatPrice(spot)}`} USDV · simulated flow moves the mid
            </Text>
          </div>
          <div className="rounded-2xl border border-bds-gray-10 bg-background px-5 py-4 dark:border-white/10 dark:bg-white/5">
            <Text variant="caption" tone="muted">
              Your {VIBE_SYMBOL}
            </Text>
            <div className="mt-1 flex items-baseline gap-2">
              <Text as="div" variant="stats" className="tabular-nums tracking-tight">
                {vibeBalance === null ? (
                  '…'
                ) : (
                  <AnimatedAmount text={formatTokenAmount(vibeBalance)} decimals={0} group />
                )}
              </Text>
              <Text variant="title3">{VIBE_SYMBOL}</Text>
            </div>
            <Text variant="footnote" tone="muted" className="mt-2">
              Each {side === 'buy' ? 'buy' : 'sell'} is {tradeLabel} {VIBE_SYMBOL}
              {side === 'buy' && draft
                ? ` · ~${formatTokenAmount(amountInForVibe(TRADE_VIBE, 'buy', k, draft.priceWad), USDV_DECIMALS)} ${USDV_SYMBOL}`
                : null}
            </Text>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] lg:items-start">
            <div className="flex flex-col gap-4">
              {draft ? (
                <OrderTicket
                  spotWad={spot}
                  side={side}
                  offsetBps={offsetBps}
                  expirySeconds={expirySeconds}
                  submitMode={submitMode}
                  busy={busy}
                  canAfford={canAffordTrade}
                  onSide={setSide}
                  onOffset={setOffsetBps}
                  onExpiry={setExpirySeconds}
                  onSubmitMode={(mode) => {
                    setSubmitMode(mode);
                    if (mode === 'concurrent' && expirySeconds > MAX_NONCELESS_SECONDS) {
                      setExpirySeconds(15);
                    }
                  }}
                  onSubmit={() => {
                    setError(null);
                    setTxHash(null);
                    setTxStep('review');
                    setTxOpen(true);
                  }}
                />
              ) : (
                <Card className="bg-background p-5 dark:bg-white/5">
                  <Text variant="title3">Conditional swap</Text>
                  <Text variant="footnote" tone="muted" className="mt-2">
                    Waiting for a live mid from the simulated pool.
                  </Text>
                </Card>
              )}
              {progress ? <Text variant="footnote" tone="muted">{progress}</Text> : null}
              {error && !txOpen ? <Text variant="footnote" className="text-bds-orange-50">{error}</Text> : null}
            </div>
            <div className="min-h-0 lg:sticky lg:top-4">
              <OrderList
                orders={orders}
                highlightedOrderId={hoveredOrderId}
                onHighlight={setHoveredOrderId}
              />
            </div>
          </div>

        </div>
      )}
        </div>
      )}
      {draft ? (
        <TransactionModal
          open={txOpen}
          onClose={() => {
            if (busy) return;
            setTxOpen(false);
            setTxStep('review');
          }}
          step={txStep}
          busy={busy}
          error={error ?? undefined}
          result={txHash ? { txHash } : null}
          titles={{ review: 'Review Transaction', submitted: 'Submitted' }}
          buildBody={null}
          canProceed
          proceedLabel="Review"
          onProceed={() => setTxStep('review')}
          reviewBody={
            <div className="flex flex-col gap-4">
              <div>
                <Text variant="title3">
                  {draft.side === 'buy' ? 'Buy' : 'Sell'} {tradeLabel} {VIBE_SYMBOL} if mid{' '}
                  {draft.side === 'buy' ? '≤' : '≥'} ${formatPrice(draft.priceWad)}
                </Text>
                <Text variant="footnote" tone="muted" className="mt-1">
                  {submitMode === 'concurrent' ? '8130 concurrent' : 'Replace resting nonce'} · expires in{' '}
                  {expirySeconds}s
                </Text>
              </div>
              <ul className="flex flex-col gap-2">
                {reviewClauses(reviewPredicates, vibeToken0).map((clause, index) => (
                  <CallRow key={`${clause.title}-${index}`} index={index + 1}>
                    <span className="font-medium text-foreground">{clause.title}</span>
                    <span className="font-sans text-bds-gray-70 dark:text-bds-gray-80">{clause.detail}</span>
                  </CallRow>
                ))}
              </ul>
              <details className="group rounded-lg border border-bds-gray-10 dark:border-white/10">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3 text-[13px] font-medium text-bds-gray-70 marker:content-none dark:text-bds-gray-80 [&::-webkit-details-marker]:hidden">
                  Advanced Details
                  <ChevronIcon className="duration-150 group-open:rotate-180" />
                </summary>
                <div className="border-t border-bds-gray-10 px-3 py-3 dark:border-white/10">
                  <ValidityJson predicates={reviewPredicates} vibeToken0={vibeToken0} />
                </div>
              </details>
            </div>
          }
          confirmLabel={`${draft.side === 'buy' ? 'Buy' : 'Sell'} ${tradeLabel} if ${draft.side === 'buy' ? '≤' : '≥'} $${formatPrice(draft.priceWad)}`}
          onConfirm={() => {
            void (async () => {
              setTxStep('submitted');
              const hash = await placeOrder();
              if (hash) setTxHash(hash);
            })();
          }}
          onReviewBack={() => {
            if (busy) return;
            setTxOpen(false);
          }}
          onSubmittedBack={() => {
            setTxStep('review');
            setError(null);
          }}
          onRetry={() => {
            void (async () => {
              setError(null);
              setTxHash(null);
              setTxStep('submitted');
              const hash = await placeOrder();
              if (hash) setTxHash(hash);
            })();
          }}
          onDone={() => {
            setTxOpen(false);
            setTxStep('review');
            setTxHash(null);
          }}
          explorerTxPath={(hash) => `${VIBENET_EXPLORER_PATH}/tx/${hash}`}
          renderSuccess={() => (
            <div className="flex flex-col items-center gap-1">
              <Text variant="title3">Transaction submitted</Text>
              <Text variant="label.regular" tone="muted">
                The sequencer will include this swap only while the predicates hold.
              </Text>
            </div>
          )}
        />
      ) : null}
    </AccountDemoShell>
  );
}
