'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEther, parseEther, type Hex, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { trackValidityOrder } from '../../../analytics/events';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { Text } from '../../../components/ui/Text';
import { CopyableValue } from '../../components/CopyableValue';
import { AccountDemoShell } from '../_components/AccountDemoShell';
import { DemoHeader } from '../_components/DemoHeader';
import { newCallRow } from '../account/library/calls';
import type { StoredAccount } from '../account/library/model';
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
  amountOutAtLimit,
  deployAmm,
  encodeApprove,
  encodeHelperSwap,
  fillQuoteFromPairLogs,
  fillQuoteFromSwapReceipt,
  getReserves,
  reservesFromSyncLog,
  tokenBalance,
} from './lib/amm';
import { clampNoncelessExpiry, noncelessFields } from './lib/aa';
import { startBots, allNeedGas, shouldFlagMakersDry } from './lib/bots';
import { CANDLE_SAMPLE_MS, CANDLE_WINDOW_MS, MAX_EXPIRY_SECONDS, MAX_NONCELESS_SECONDS } from './lib/constants';
import { faucetErrorMessage } from './lib/faucet';
import { ensureMakers, rootAccount } from './lib/makers';
import {
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
  quoteWad,
  swapOuts,
  tokenInFor,
  vibeIsToken0,
} from './lib/quote';
import {
  chainFromId,
  describeValidityError,
  fetchChainStatus,
  makePublicClient,
  makeWalletClient,
  sendValidityTransaction,
  type RpcSend,
} from './lib/rpc';
import { connectJsonRpcStream, headNumber, type StreamHead, type StreamLog } from './lib/stream';
import { createState, dropDeployment, loadState, saveState, type StoredState } from './lib/store';
import type { ChainStatus, PlacedOrder, Rectangle, Reserves, Side, SubmitMode } from './lib/types';

/** HTTP fallback when the read host has no `/ws`. Submit is always HTTP.
 *  The socket carries heads, pair logs, and remaining reads (balances, receipts). */
const SYNC_MS = 1_000;
const BALANCE_MS = 5_000;
const DEFAULT_SIZE_FRACTION = 50n; // 1/50 of inventory
const OWNER_DEPLOY_GAS = parseEther('0.05');
const OWNER_DEPLOY_SEND = '0.06';

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

  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [state, setState] = useState<StoredState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [reserves, setReserves] = useState<Reserves | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botsOn, setBotsOn] = useState(true);
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
  const [makerError, setMakerError] = useState<string | null>(null);
  const [makersDry, setMakersDry] = useState(false);
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [streamLive, setStreamLive] = useState(false);

  const publicRef = useRef<PublicClient | null>(null);
  const rpcSendRef = useRef<RpcSend | null>(null);
  const headFeesRef = useRef<ReturnType<typeof feesFromHead>>(null);
  const makerNonceRef = useRef<(bigint | null)[]>([]);
  const makerDeployedRef = useRef<boolean[]>([]);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const botsEnabledRef = useRef(true);
  botsEnabledRef.current = botsOn;
  const lastMakerPriceAtRef = useRef(0);
  const makersRef = useRef<StoredAccount[]>([]);
  const makerEthRef = useRef<(bigint | null)[]>([]);
  const makerTokenRef = useRef<Record<string, bigint>>({});

  const ordersRef = useRef<PlacedOrder[]>([]);
  ordersRef.current = orders;
  const reservesRef = useRef<Reserves | null>(null);
  reservesRef.current = reserves;
  const samplesRef = useRef<PriceSample[]>([]);
  samplesRef.current = samples;
  const stateRef = useRef<StoredState | null>(null);
  stateRef.current = state;

  const persist = useCallback((next: StoredState) => {
    saveState(next);
    setState(next);
  }, []);

  const pushSample = useCallback((price: number) => {
    if (!Number.isFinite(price) || price <= 0) return;
    setSamples((prev) => {
      const next = [...prev, { t: Date.now(), price }];
      const keep = Math.ceil(CANDLE_WINDOW_MS / CANDLE_SAMPLE_MS) + 8;
      return next.length > keep ? next.slice(-keep) : next;
    });
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

  const parent = useMemo(
    () => (acct ? rootAccount(acct, engine.accounts) : null),
    [acct, engine.accounts],
  );

  const makers = useMemo(() => {
    if (!parent) return [] as StoredAccount[];
    const ids = state?.makerAccountIds;
    const resolved = (ids ?? [])
      .map((id) => engine.accounts.find((item) => item.id === id))
      .filter((item): item is StoredAccount => Boolean(item));
    if (resolved.length === 2) return resolved;
    return engine.accounts.filter((item) => item.parentId === parent.id && item.label.startsWith('Validity maker'));
  }, [engine.accounts, parent, state?.makerAccountIds]);
  makersRef.current = makers;

  const poolForThisAccount = Boolean(
    state?.deployment &&
      (!state.accountId ||
        parent?.id === state.accountId ||
        (acct && state.makerAccountIds?.includes(acct.id))),
  );

  useEffect(() => {
    let cancelled = false;
    fetchChainStatus()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        if (!next.chainId || !next.genesisHash) {
          setStatusError('RPC did not return a chain id / genesis hash.');
          return;
        }
        const existing = loadState();
        if (existing && existing.chainId === next.chainId && existing.genesisHash === next.genesisHash) {
          setState(existing);
        } else {
          const created = createState(next.chainId, next.genesisHash);
          persist(created);
        }
        publicRef.current = makePublicClient(chainFromId(next.chainId), () => rpcSendRef.current);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatusError(err instanceof Error ? err.message : 'Could not reach the validity RPC proxy.');
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [persist]);

  useEffect(() => {
    if (!status?.chainId) return;
    publicRef.current = makePublicClient(chainFromId(status.chainId), () => rpcSendRef.current);
  }, [status?.chainId]);

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
      if (filled) trackValidityOrder(order.side, 'filled');
      else if (wasPending) trackValidityOrder(order.side, 'error');
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
    if (!hydrated || !acct || !status?.chainId) return;
    const client = publicRef.current;
    if (!client) return;
    let cancelled = false;
    let inFlight = false;
    let pollId: number | undefined;
    let balanceId: number | undefined;
    let stream: ReturnType<typeof connectJsonRpcStream> | undefined;
    const logsByTx = new Map<string, StreamLog[]>();

    const applyMakerParts = (deployment: StoredState['deployment'], makerParts: unknown[]) => {
      const makerList = makersRef.current;
      const stride = deployment ? 3 : 1;
      makerEthRef.current = makerList.map((_, index) => {
        const value = makerParts[index * stride];
        return typeof value === 'bigint' ? value : null;
      });
      const tokens: Record<string, bigint> = {};
      if (deployment) {
        makerList.forEach((maker, index) => {
          const vibe = makerParts[index * stride + 1];
          const usdv = makerParts[index * stride + 2];
          if (typeof vibe === 'bigint') tokens[`${maker.address}:${deployment.tokenA}`] = vibe;
          if (typeof usdv === 'bigint') tokens[`${maker.address}:${deployment.tokenB}`] = usdv;
        });
      }
      makerTokenRef.current = tokens;
      const known = makerEthRef.current.filter((value): value is bigint => value !== null);
      if (known.length === makerList.length && makerList.length > 0 && !allNeedGas(known)) {
        setMakersDry(false);
      }
    };

    const pullBalances = async (includeReserves: boolean) => {
      const deployment = stateRef.current?.deployment;
      const makerList = makersRef.current;
      const jobs: Promise<unknown>[] = [client.getBalance({ address: acct.address })];
      if (includeReserves) {
        jobs.push(deployment ? getReserves(client, deployment.pair).catch(() => null) : Promise.resolve(null));
      }
      for (const maker of makerList) {
        jobs.push(client.getBalance({ address: maker.address }).catch(() => null));
        if (deployment) {
          jobs.push(tokenBalance(client, deployment.tokenA, maker.address).catch(() => null));
          jobs.push(tokenBalance(client, deployment.tokenB, maker.address).catch(() => null));
        }
      }
      const [eth, ...rest] = await Promise.all(jobs);
      if (cancelled) return;
      if (typeof eth === 'bigint') setEthBalance(eth);
      if (includeReserves) {
        const latestReserves = rest[0];
        const makerParts = rest.slice(1);
        if (latestReserves && deployment) {
          const latest = latestReserves as Reserves;
          setReserves(latest);
        }
        applyMakerParts(deployment, makerParts);
        return;
      }
      applyMakerParts(deployment, rest);
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

    if (status.wsUrl) {
      void startStream(status.wsUrl).catch(() => {
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
  }, [acct, applyReceipts, expireOrders, hydrated, markOrderLanded, pushSample, status?.chainId, status?.wsUrl, state?.deployment?.pair]);

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
    if (blockNumber === null || !status?.blockNumberPredicate) return draft.predicates;
    const seconds =
      submitMode === 'concurrent'
        ? clampNoncelessExpiry(expirySeconds)
        : Math.min(MAX_EXPIRY_SECONDS, expirySeconds);
    const maxBlock = maxBlockForExpiry(blockNumber, seconds);
    return [...draft.predicates, blockExpiryPredicate(maxBlock)];
  }, [blockNumber, draft, expirySeconds, status?.blockNumberPredicate, submitMode]);

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
      setError(faucetErrorMessage(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [engine]);

  const deploy = async () => {
    if (!acct || !parent || !status?.chainId) return;
    const publicClient = publicRef.current;
    if (!publicClient) return;
    const k1 = engine.ownerSigners.find((signer) => signer.kind === 'k1' && signer.privateKey);
    if (!k1?.privateKey) {
      setError('Pool deploy needs a K1 owner key on this account. Add one in Accounts.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [makerA, makerB] = ensureMakers(
        parent,
        engine.accounts,
        state?.makerAccountIds,
        engine.doCreateSubAccount,
      );
      persist({
        ...(state ?? createState(status.chainId, status.genesisHash ?? '')),
        accountId: parent.id,
        makerAccountIds: [makerA.id, makerB.id],
      });

      const eoa = privateKeyToAccount(k1.privateKey);
      const eoaBal = await publicClient.getBalance({ address: eoa.address });
      if (eoaBal < OWNER_DEPLOY_GAS) {
        setProgress('Sending ETH to the owner key for contract creates');
        await engine.sendActiveCalls({
          calls: [{ to: eoa.address, data: '0x', value: OWNER_DEPLOY_SEND }],
          metadata: 'Validity deploy gas',
        });
      }

      const chain = chainFromId(status.chainId);
      const wallet = makeWalletClient(chain, eoa);
      const traders = [acct.address, makerA.address, makerB.address];
      const deployment = await deployAmm({
        wallet,
        publicClient,
        account: eoa,
        traders,
        onProgress: setProgress,
      });

      setProgress('Approving the swap helper');
      await engine.sendActiveCalls({
        calls: [
          encodeApprove(deployment.token0, deployment.helper),
          encodeApprove(deployment.token1, deployment.helper),
        ],
        metadata: 'Validity helper approve',
      });

      setMakersDry(false);
      setMakerError(null);
      lastMakerPriceAtRef.current = 0;
      persist({
        ...(state ?? createState(status.chainId, status.genesisHash ?? '')),
        v: 2,
        chainId: status.chainId,
        genesisHash: status.genesisHash ?? '',
        accountId: parent.id,
        makerAccountIds: [makerA.id, makerB.id],
        deployment,
      });
      engine.pushActivity({
        kind: 'transact',
        title: 'Validity pool deployed',
        detail: `Pair ${deployment.pair}`,
        account: acct.address,
        network: engine.chain.name,
        mode: engine.chain.mode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const makerKey = makers.map((maker) => maker.id).join(',');

  useEffect(() => {
    if (!hydrated || !status?.chainId || !state?.deployment || makersRef.current.length !== 2) return;
    makerNonceRef.current = [];
    makerDeployedRef.current = [];
    makerEthRef.current = makersRef.current.map(() => null);
    setMakersDry(false);
    const deployment = state.deployment;
    const stop = startBots({
      addresses: makersRef.current.map((maker) => maker.address),
      deployment,
      reserves: () => reservesRef.current,
      ethBalance: (index) => makerEthRef.current[index] ?? null,
      tokenBalance: (index, token) => {
        const maker = makersRef.current[index];
        if (!maker) return null;
        return makerTokenRef.current[`${maker.address}:${token}`] ?? null;
      },
      sendSwap: async (index, calls) => {
        const maker = makersRef.current[index];
        if (!maker) throw new Error('maker missing');
        const client = publicRef.current;
        let nonce = makerNonceRef.current[index] ?? null;
        if (nonce === null && client) {
          nonce = BigInt(await client.getTransactionCount({ address: maker.address }));
        }
        const nonceSequence = nonce ?? 0n;
        const rows = calls.map((call) => ({ ...call, value: '0' as const }));
        const send = (deployed: boolean) =>
          engineRef.current.sendAccountCalls({
            account: maker,
            calls: rows,
            // First swap carries `create` and must land before we pin nonces.
            wait: !deployed,
            seqOpt: {
              nonceSequence,
              ...(deployed ? { assumeDeployed: true } : {}),
            },
          });
        try {
          const deployed = makerDeployedRef.current[index] === true;
          try {
            await send(deployed);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!deployed || !/actor is not bound/i.test(message)) throw err;
            // Replica still missing the create, or we guessed deployed too early.
            makerDeployedRef.current[index] = false;
            await send(false);
          }
          makerDeployedRef.current[index] = true;
          makerNonceRef.current[index] = nonceSequence + 1n;
        } catch (err) {
          makerNonceRef.current[index] = null;
          throw err;
        }
      },
      enabled: () => botsEnabledRef.current,
      onPrice: () => {
        lastMakerPriceAtRef.current = Date.now();
        setMakerError(null);
        setMakersDry(false);
      },
      onError: setMakerError,
      onGasLow: () => {
        for (const maker of makersRef.current) engineRef.current.autoFundNewAccount(maker.address);
        if (
          shouldFlagMakersDry(
            makerEthRef.current,
            makersRef.current.length,
            lastMakerPriceAtRef.current,
          )
        ) {
          setMakersDry(true);
          setMakerError('need ETH');
        }
      },
    });
    return stop;
  }, [hydrated, makerKey, state?.deployment, status?.chainId]);

  const placeOrder = async (): Promise<Hex | undefined> => {
    if (!draft || !acct || !state?.deployment || !reserves || !engine.activeSigner) return;
    const publicClient = publicRef.current;
    if (!publicClient) return;
    setBusy(true);
    setError(null);
    const side: Side = draft.side;
    const tokenIn = tokenInFor(state.deployment, side === 'sell');
    try {
      const inventory = await tokenBalance(publicClient, tokenIn, acct.address);
      const amountIn = inventory / DEFAULT_SIZE_FRACTION;
      if (amountIn === 0n) throw new Error('Not enough token inventory to swap.');
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
      const validity = [...draft.predicates];
      if (status?.blockNumberPredicate) {
        validity.push(blockExpiryPredicate(maxBlock));
      }
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
        size: amountIn,
        expirySeconds: seconds,
        submitMode,
        maxBlock: status?.blockNumberPredicate ? maxBlock : undefined,
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

  const resetDemo = () => {
    if (!state) return;
    setOrders([]);
    setSamples([]);
    setReserves(null);
    setMakerError(null);
    setMakersDry(false);
    setHoveredOrderId(null);
    setError(null);
    setProgress(null);
    setBotsOn(true);
    lastMakerPriceAtRef.current = 0;
    persist(dropDeployment(state));
  };

  const address = acct?.address;
  const funded = (ethBalance ?? 0n) > 0n;
  const deployed = Boolean(poolForThisAccount);

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
        description="A transaction can carry predicates the sequencer checks before inclusion. This page deploys a simulated VIBE/USDV pool so you can watch a swap wait for a price condition, then land or expire."
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] text-bds-gray-60">
          <span>{status?.readHost ?? 'no rpc'}</span>
          <span>{streamLive ? '200ms heads' : '200ms blocks'}</span>
          <span>validity {status?.validitySupported ? 'on' : 'unavailable'}</span>
          {status?.blockNumberPredicate ? <span>block bounds on</span> : <span>client-side expiry only</span>}
          <span>simulation {botsOn ? (makersDry ? 'out of ETH' : 'live') : 'paused'}</span>
          {makerError && !makersDry ? <span className="text-bds-orange-50">simulation {makerError}</span> : null}
          {deployed || makersDry ? (
            <Button
              size="sm"
              variant={makersDry ? 'primary' : 'outline'}
              disabled={busy || !state}
              onClick={resetDemo}
              className={cn(
                'ml-auto',
                makersDry &&
                  'border-transparent bg-bds-orange-50 text-black ring-2 ring-bds-orange-50/80 ring-offset-2 ring-offset-background hover:bg-bds-orange-40 dark:text-black dark:hover:bg-bds-orange-50',
              )}
            >
              {makersDry ? 'Reset demo' : 'Reset'}
            </Button>
          ) : null}
        </div>
        {makersDry ? (
          <Text variant="footnote" className="text-bds-orange-50">
            Simulated flow ran out of ETH. Reset drops this pool so you can top up and deploy again.
          </Text>
        ) : null}
      </div>

      {statusError ? (
        <Card className="bg-background p-4 text-bds-orange-50 dark:bg-white/5">{statusError}</Card>
      ) : null}

      {!deployed ? (
        <Card className="flex flex-col gap-4 bg-background p-6 dark:bg-white/5">
          <Text variant="title3">Simulated pool</Text>
          <Text variant="label.regular" tone="muted">
            Your Vibenet account signs the swaps — several 8130 conditions can rest
            at once, or one sequenced replacement. Deploy creates two maker
            subaccounts that move the simulated mid.
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
            <Button variant="secondary" onClick={() => void deploy()} disabled={busy || !funded}>
              Deploy pool
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-10">
          <div className="flex min-w-0 flex-col gap-3">
              <PriceCandles samples={samples} levels={chartLevels} fills={fillMarks} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Text variant="footnote" tone="muted">
                Spot {spot === 0n ? '—' : `$${formatPrice(spot)}`} USDV · simulated flow moves the mid
              </Text>
              <button
                type="button"
                className="text-[12px] text-base-blue"
                onClick={() => setBotsOn((value) => !value)}
              >
                {botsOn ? 'Pause simulation' : 'Resume simulation'}
              </button>
            </div>
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
                  validitySupported={Boolean(status?.validitySupported)}
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
                  {draft.side === 'buy' ? 'Buy' : 'Sell'} VIBE if mid {draft.side === 'buy' ? '≤' : '≥'} $
                  {formatPrice(draft.priceWad)}
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
                  <ValidityJson predicates={reviewPredicates} vibeToken0={vibeToken0} compact />
                </div>
              </details>
            </div>
          }
          confirmLabel={`Submit if ${draft.side === 'buy' ? '≤' : '≥'} $${formatPrice(draft.priceWad)}`}
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
              <Text variant="title3">Condition submitted</Text>
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
