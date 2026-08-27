'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, PublicClient, WalletClient } from 'viem';
import { formatEther } from 'viem';

import { trackValidityOrder } from '../../../analytics/events';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { Text } from '../../../components/ui/Text';
import { CopyableValue } from '../../components/CopyableValue';
import { DemoHeader } from '../_components/DemoHeader';
import { OrderList } from './components/OrderList';
import { OrderTicket } from './components/OrderTicket';
import { PriceCandles, type FillMark, type PriceLevel, type PriceSample } from './components/PriceCandles';
import { ReserveChart } from './components/ReserveChart';
import { ValidityJson } from './components/ValidityJson';
import {
  amountOutAtLimit,
  deployAmm,
  encodeHelperSwap,
  fillQuoteFromSwapReceipt,
  getReserves,
  signCall,
  tokenBalance,
} from './lib/amm';
import { startBots, allNeedGas, botNeedsGas, refuelValue } from './lib/bots';
import { MAX_EXPIRY_SECONDS } from './lib/constants';
import { faucetErrorMessage, seedEthFromFaucet } from './lib/faucet';
import {
  maxBlockForExpiry,
  occupyingOrder,
  orderBlockExpired,
  orderWallClockExpired,
  restingOrderToReplace,
  tapeCrossedAt,
} from './lib/orders';
import { bumpReplacementFees, isReplacementUnderpriced, padFees } from './lib/fees';
import { applyOffsetBps, blockExpiryPredicate, formatPrice, priceValidity, spotPastTarget } from './lib/predicates';
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
} from './lib/rpc';
import { accountsFrom, createState, dropDeployment, loadState, saveState, type StoredState } from './lib/store';
import type { ChainStatus, PlacedOrder, Rectangle, Reserves, Side } from './lib/types';

const POLL_MS = 400;
/** L2 blocks are ~2s. viem's default 4s block cache made this skip 2–3 heads. */
const BLOCK_POLL_MS = 1_000;
const DEFAULT_SIZE_FRACTION = 50n; // 1/50 of inventory

function wadToNumber(wad: bigint): number {
  return Number(wad) / 1e18;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ValidityDemo() {
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
  const [hoverPrice, setHoverPrice] = useState<bigint | null>(null);
  const [side, setSide] = useState<Side>('buy');
  const [offsetBps, setOffsetBps] = useState(100);
  const [expirySeconds, setExpirySeconds] = useState(60);
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const [samples, setSamples] = useState<PriceSample[]>([]);
  const [makerError, setMakerError] = useState<string | null>(null);
  const [makersDry, setMakersDry] = useState(false);
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);

  const publicRef = useRef<PublicClient | null>(null);
  const userWalletRef = useRef<WalletClient | null>(null);
  const userAccountRef = useRef<Account | null>(null);
  const botsEnabledRef = useRef(true);
  botsEnabledRef.current = botsOn;
  const busyRef = useRef(false);
  busyRef.current = busy;
  const refuelInFlightRef = useRef(false);
  const lastMakerPriceAtRef = useRef(0);
  const autoFaucetRef = useRef(false);

  const ordersRef = useRef<PlacedOrder[]>([]);
  ordersRef.current = orders;
  const reservesRef = useRef<Reserves | null>(null);
  reservesRef.current = reserves;
  const samplesRef = useRef<PriceSample[]>([]);
  samplesRef.current = samples;

  const persist = useCallback((next: StoredState) => {
    saveState(next);
    setState(next);
  }, []);

  const pushSample = useCallback((price: number) => {
    if (!Number.isFinite(price) || price <= 0) return;
    setSamples((prev) => {
      const next = [...prev, { t: Date.now(), price }];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, []);

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
        const chain = chainFromId(next.chainId);
        publicRef.current = makePublicClient(chain);
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

  const accounts = useMemo(() => (state ? accountsFrom(state) : null), [state]);

  useEffect(() => {
    if (!status?.chainId || !accounts) return;
    const chain = chainFromId(status.chainId);
    publicRef.current = makePublicClient(chain);
    userAccountRef.current = accounts.user;
    userWalletRef.current = makeWalletClient(chain, accounts.user);
  }, [accounts, status?.chainId]);

  const refreshBalances = useCallback(async () => {
    const client = publicRef.current;
    const account = userAccountRef.current;
    if (!client || !account) return;
    const [eth, latestReserves] = await Promise.all([
      client.getBalance({ address: account.address }),
      state?.deployment ? getReserves(client, state.deployment.pair).catch(() => null) : Promise.resolve(null),
    ]);
    setEthBalance(eth);
    if (latestReserves && state?.deployment) {
      setReserves(latestReserves);
      const quote = quoteWad(latestReserves.reserve0, latestReserves.reserve1, vibeIsToken0(state.deployment));
      pushSample(Number(quote) / 1e18);
    }
  }, [pushSample, state?.deployment]);

  useEffect(() => {
    if (!hydrated || !accounts) return;
    void refreshBalances().catch(() => {});
    const id = window.setInterval(() => {
      void refreshBalances().catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [accounts, hydrated, refreshBalances]);

  const refuelBots = useCallback(async (): Promise<boolean> => {
    const publicClient = publicRef.current;
    const wallet = userWalletRef.current;
    const account = userAccountRef.current;
    if (!publicClient || !accounts || busyRef.current || refuelInFlightRef.current) return true;
    refuelInFlightRef.current = true;
    let needed = false;
    let refilled = false;
    try {
      let userBal = await publicClient.getBalance({ address: accounts.user.address });
      for (const bot of accounts.bots) {
        const bal = await publicClient.getBalance({ address: bot.address });
        if (!botNeedsGas(bal)) continue;
        needed = true;
        const value = refuelValue(bal, userBal);
        if (value === 0n || !wallet || !account) continue;
        await wallet.sendTransaction({
          account,
          chain: wallet.chain,
          to: bot.address,
          value,
        });
        userBal -= value;
        refilled = true;
      }
    } finally {
      refuelInFlightRef.current = false;
    }
    return !needed || refilled;
  }, [accounts]);

  useEffect(() => {
    if (!hydrated || !accounts || !state?.deployment) return;
    const id = window.setInterval(() => {
      void refuelBots();
    }, 8_000);
    return () => window.clearInterval(id);
  }, [accounts, hydrated, refuelBots, state?.deployment]);

  useEffect(() => {
    if (!hydrated || !status?.chainId) return;
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      const client = publicRef.current;
      if (!client || inFlight) return;
      inFlight = true;
      try {
        const block = await client.getBlockNumber({ cacheTime: 0 });
        if (!cancelled) setBlockNumber((prev) => (prev === block ? prev : block));
      } catch {
        // keep the last block we saw
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, BLOCK_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [hydrated, status?.chainId]);

  useEffect(() => {
    if (!status?.chainId || !state?.deployment || !accounts) return;
    const chain = chainFromId(status.chainId);
    const publicClient = makePublicClient(chain);
    const wallets = accounts.bots.map((bot) => makeWalletClient(chain, bot));
    const stop = startBots({
      publicClient,
      wallets,
      accounts: [...accounts.bots],
      deployment: state.deployment,
      enabled: () => botsEnabledRef.current,
      onPrice: (price) => {
        lastMakerPriceAtRef.current = Date.now();
        pushSample(price);
        setMakerError(null);
        setMakersDry(false);
      },
      onError: setMakerError,
      onGasLow: () => {
        void (async () => {
          const ok = await refuelBots();
          if (Date.now() - lastMakerPriceAtRef.current < 2_500) return;
          const client = publicRef.current;
          if (!client || !accounts) return;
          const balances = await Promise.all(
            accounts.bots.map((bot) => client.getBalance({ address: bot.address })),
          );
          if (!allNeedGas(balances)) return;
          setMakersDry(true);
          if (!ok) setMakerError('need ETH');
        })();
      },
    });
    return stop;
  }, [accounts, pushSample, refuelBots, state?.deployment, status?.chainId]);

  // Watch pending orders for inclusion / expiry. Refs so reserve polling cannot
  // reset the interval before it ever fires. Wall-clock expiry does not wait on RPC.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

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

    const patchOrders = (patch: (order: PlacedOrder) => PlacedOrder) => {
      let changed = false;
      const next = ordersRef.current.map((order) => {
        const updated = patch(order);
        if (updated !== order) changed = true;
        return updated;
      });
      if (!changed) return;
      ordersRef.current = next;
      setOrders(next);
    };

    const tick = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const latest = ordersRef.current;
        if (latest.length === 0) return;

        const client = publicRef.current;
        if (!client) return;

        const reservesNow = reservesRef.current;
        const deployment = state?.deployment;
        const spot =
          reservesNow && deployment
            ? quoteWad(reservesNow.reserve0, reservesNow.reserve1, vibeIsToken0(deployment))
            : null;

        for (const order of ordersRef.current) {
          if (!order.txHash || (order.status !== 'pending' && order.status !== 'expired')) continue;
          const receipt = await withTimeout(
            client.getTransactionReceipt({ hash: order.txHash }),
            2_500,
          ).catch(() => null);
          if (cancelled) return;
          if (!receipt) continue;
          const filled = receipt.status === 'success';
          const vibeToken0Now = Boolean(deployment && vibeIsToken0(deployment));
          const observed = filled
            ? (deployment
                ? fillQuoteFromSwapReceipt(receipt, deployment.pair, vibeToken0Now)
                : undefined)
            : undefined;
          const fillPriceWad = filled
            ? clampToCondition(order.side, observed ?? order.targetPriceWad, order.targetPriceWad)
            : undefined;
          const target = wadToNumber(order.targetPriceWad);
          const crossed = tapeCrossedAt(samplesRef.current, order.submittedAt, target, order.side);
          let filledAt = crossed;
          if (filled && filledAt === undefined) {
            const header = await withTimeout(
              client.getBlock({ blockNumber: receipt.blockNumber }),
              2_500,
            ).catch(() => null);
            filledAt = header ? Number(header.timestamp) * 1000 : Date.now();
          }
          const wasPending = order.status === 'pending';
          patchOrders((item) =>
            item.id === order.id
              ? {
                  ...item,
                  status: filled ? 'filled' : 'error',
                  filledAt: filled ? (item.filledAt ?? filledAt) : item.filledAt,
                  fillPriceWad: filled ? (item.fillPriceWad ?? fillPriceWad) : item.fillPriceWad,
                }
              : item,
          );
          if (wasPending) {
            trackValidityOrder(order.side, filled ? 'filled' : 'error');
          }
        }

        const now = Date.now();
        const wallExpired = ordersRef.current.filter((order) => orderWallClockExpired(order, now));
        if (wallExpired.length > 0) {
          const ids = new Set(wallExpired.map((order) => order.id));
          patchOrders((item) =>
            ids.has(item.id) && item.status === 'pending' ? { ...item, status: 'expired' } : item,
          );
          for (const order of wallExpired) {
            trackValidityOrder(order.side, 'expired');
          }
        }

        const block = await withTimeout(client.getBlockNumber({ cacheTime: 0 }), 2_500).catch(() => null);
        if (cancelled) return;
        if (block !== null) {
          const blockExpired = ordersRef.current.filter((order) => orderBlockExpired(order, block));
          if (blockExpired.length > 0) {
            const ids = new Set(blockExpired.map((order) => order.id));
            patchOrders((item) =>
              ids.has(item.id) && item.status === 'pending' ? { ...item, status: 'expired' } : item,
            );
            for (const order of blockExpired) {
              trackValidityOrder(order.side, 'expired');
            }
          }
        }

        if (spot) {
          patchOrders((order) =>
            order.status === 'expired' &&
            !order.crossedAfterExpiry &&
            spotPastTarget(spot, order.targetPriceWad, order.side)
              ? { ...order, crossedAfterExpiry: true }
              : order,
          );
        }
      } finally {
        inFlight = false;
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, 700);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [state?.deployment, status?.chainId]);

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

  const jsonOrder =
    orders.find((order) => order.id === hoveredOrderId && order.validity.length > 0) ?? null;

  const hoodPredicates = useMemo(() => {
    if (jsonOrder) return jsonOrder.validity;
    if (!draft) return [];
    if (blockNumber === null || !status?.blockNumberPredicate) return draft.predicates;
    const seconds = Math.min(MAX_EXPIRY_SECONDS, expirySeconds);
    const maxBlock = maxBlockForExpiry(blockNumber, seconds);
    return [...draft.predicates, blockExpiryPredicate(maxBlock)];
  }, [blockNumber, draft, expirySeconds, jsonOrder, status?.blockNumberPredicate]);

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
    if (!accounts) return;
    const publicClient = publicRef.current;
    if (!publicClient) return;
    setBusy(true);
    setError(null);
    try {
      setProgress('Requesting ETH from the faucet');
      await seedEthFromFaucet(accounts.user.address, () =>
        publicClient.getBalance({ address: accounts.user.address }),
      );
      await refreshBalances();
    } catch (err) {
      setError(faucetErrorMessage(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [accounts, refreshBalances]);

  useEffect(() => {
    if (!hydrated || !accounts || busy || autoFaucetRef.current) return;
    if (ethBalance === null) return;
    if (ethBalance > 0n) {
      autoFaucetRef.current = true;
      return;
    }
    autoFaucetRef.current = true;
    void fund();
  }, [accounts, busy, ethBalance, fund, hydrated]);

  const deploy = async () => {
    if (!accounts || !status?.chainId) return;
    const wallet = userWalletRef.current;
    const publicClient = publicRef.current;
    const account = userAccountRef.current;
    if (!wallet || !publicClient || !account || !state) return;
    setBusy(true);
    setError(null);
    try {
      const deployment = await deployAmm({
        wallet,
        publicClient,
        account,
        extraRecipients: accounts.bots.map((bot) => bot.address),
        onProgress: setProgress,
      });
      persist({ ...state, deployment });
      setProgress('Seeding bot gas');
      for (const bot of accounts.bots) {
        const userBal = await publicClient.getBalance({ address: account.address });
        const value = refuelValue(0n, userBal);
        if (value === 0n) continue;
        const hash = await wallet.sendTransaction({
          account,
          chain: wallet.chain,
          to: bot.address,
          value,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refreshBalances();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const placeOrder = async () => {
    if (!draft || !accounts || !state?.deployment || !reserves) return;
    const wallet = userWalletRef.current;
    const publicClient = publicRef.current;
    const account = userAccountRef.current;
    if (!wallet || !publicClient || !account) return;
    setBusy(true);
    setError(null);
    const side: Side = draft.side;
    const tokenIn = tokenInFor(state.deployment, side === 'sell');
    try {
      const inventory = await tokenBalance(publicClient, tokenIn, account.address);
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
      const confirmedNonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: 'latest',
      });
      const occupant = occupyingOrder(ordersRef.current, confirmedNonce);
      const replaced = restingOrderToReplace(ordersRef.current, confirmedNonce);
      const estimated = await publicClient.estimateFeesPerGas().catch(() => null);
      const padded =
        estimated?.maxFeePerGas !== undefined && estimated.maxPriorityFeePerGas !== undefined
          ? padFees({
              maxFeePerGas: estimated.maxFeePerGas,
              maxPriorityFeePerGas: estimated.maxPriorityFeePerGas,
            })
          : null;
      let fees = padded;
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
        signCall({
          wallet,
          publicClient,
          account,
          to: call.to,
          data: call.data,
          nonce: confirmedNonce,
          fees: nextFees,
        });
      let signedResult = await sign(fees);
      const seconds = Math.min(MAX_EXPIRY_SECONDS, expirySeconds);
      const block = await publicClient.getBlockNumber({ cacheTime: 0 });
      const maxBlock = maxBlockForExpiry(block, seconds);
      const validity = [...draft.predicates];
      if (status?.blockNumberPredicate) {
        validity.push(blockExpiryPredicate(maxBlock));
      }
      trackValidityOrder(side, 'submitted');
      let hash;
      try {
        hash = await sendValidityTransaction(publicClient, signedResult.signed, validity);
      } catch (err) {
        if (!isReplacementUnderpriced(err) || !signedResult.fees) throw err;
        signedResult = await sign(bumpReplacementFees(signedResult.fees, padded));
        hash = await sendValidityTransaction(publicClient, signedResult.signed, validity);
      }
      const order: PlacedOrder = {
        id: newId(),
        side,
        targetPriceWad: draft.priceWad,
        size: amountIn,
        expirySeconds: seconds,
        maxBlock: status?.blockNumberPredicate ? maxBlock : undefined,
        submittedAt: Date.now(),
        txHash: hash,
        nonce: signedResult.nonce,
        maxFeePerGas: signedResult.fees?.maxFeePerGas,
        maxPriorityFeePerGas: signedResult.fees?.maxPriorityFeePerGas,
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

  const address = accounts?.user.address;
  const funded = (ethBalance ?? 0n) > 0n;
  const deployed = Boolean(state?.deployment);

  if (!hydrated) return <div className="py-20" />;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-10 pb-16 text-foreground">
      <DemoHeader
        eyebrow="Validity · experimental"
        title="Send now. Land later."
        description="A transaction can carry predicates the sequencer checks before inclusion. This page deploys a simulated VIBE/USDV pool so you can watch a swap wait for a price condition, then land or expire."
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] text-bds-gray-60">
          <span>{status?.readHost ?? 'no rpc'}</span>
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
            A local EOA (not the Vibenet 8130 account) signs the swaps. The faucet
            funds it, then you deploy a VIBE/USDV pool. Simulated flow moves the mid
            so you can see a price condition fire — or expire unused.
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
            <Button onClick={() => void fund()} disabled={busy || !address}>
              Fund from faucet
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
                  busy={busy}
                  validitySupported={Boolean(status?.validitySupported)}
                  onSide={setSide}
                  onOffset={setOffsetBps}
                  onExpiry={setExpirySeconds}
                  onSubmit={() => void placeOrder()}
                />
              ) : (
                <Card className="bg-background p-5 dark:bg-white/5">
                  <Text variant="title3">Conditional swap</Text>
                  <Text variant="footnote" tone="muted" className="mt-2">
                    Waiting for a live mid from the simulated pool.
                  </Text>
                </Card>
              )}
              {error ? <Text variant="footnote" className="text-bds-orange-50">{error}</Text> : null}
            </div>
            <div className="min-h-0 lg:sticky lg:top-4">
              <OrderList
                orders={orders}
                highlightedOrderId={hoveredOrderId}
                onHighlight={setHoveredOrderId}
              />
            </div>
          </div>

          <section className="flex flex-col gap-4">
            <div>
              <Text as="h2" variant="title3">
                Under the hood
              </Text>
              <Text variant="footnote" tone="muted" className="mt-1">
                The hatched box on the curve is four storage reads on the pair&apos;s
                reserves word, plus an optional block expiry. The payload on the left
                is what gets submitted; the right column is what each field means.
              </Text>
            </div>
            <ReserveChart
              reserves={reserves}
              hoverPriceWad={hoverPrice}
              draft={draft}
              orders={orders}
              highlightedOrderId={hoveredOrderId}
              vibeToken0={vibeToken0}
              onHover={setHoverPrice}
            />
            {draft || jsonOrder ? (
              <ValidityJson
                predicates={hoodPredicates}
                frozen={Boolean(jsonOrder)}
                vibeToken0={vibeToken0}
              />
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
