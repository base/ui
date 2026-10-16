'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseEventLogs, type Address, type Hex, type PublicClient } from 'viem';

import { trackValidityLiquidation } from '../../../../analytics/events';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { vibenetApi } from '../../../library/client';
import { VIBENET_EXPLORER_PATH, VIBENET_WS_URL } from '../../../library/config';
import { AccountDemoShell } from '../../_components/AccountDemoShell';
import { DemoHeader } from '../../_components/DemoHeader';
import { ChevronIcon } from '../../_shared/dropdown';
import { AccountEngineProvider, useAccountEngine } from '../../account/useAccountEngine';
import { CodeSnippet } from '../components/CodeSnippet';
import { USDV_DECIMALS, VIBE_DECIMALS, WAD } from '../lib/constants';
import { signK1Eip1559Call } from '../lib/eip1559';
import {
  encodeLiquidate,
  healthFactorWad,
  isLiquidatable,
  liquidationPriceWad,
  liquidationReward,
  liquidationValidity,
  probeLending,
  readBook,
  spotPriceWad,
  vibeLendAbi,
  type BookEntry,
  type LendingReserves,
} from '../lib/lending';
import { maxBlockForExpiry } from '../lib/orders';
import { formatPrice, prettyValidity } from '../lib/predicates';
import { formatTokenAmount, vibeIsToken0 } from '../lib/quote';
import { describeValidityError, makePublicClient, sendValidityTransaction, type RpcSend } from '../lib/rpc';
import { probeSingleton } from '../lib/singleton';
import { connectJsonRpcStream, headNumber, type StreamHead } from '../lib/stream';
import {
  blocksUnderwater,
  isSettled,
  LIQUIDATION_EXPIRY_OPTIONS,
  nonceFree,
  positionKey,
  shortAddress,
  totalEarned,
  trackUnderwater,
  type AttemptKind,
  type LiquidationAttempt,
  type LiquidationEvent,
  type LiquidationExpiry,
  type Underwater,
} from './attempts';

const POLL_MS = 500;
const RECEIPT_POLL_MS = 1_000;
const LOG_POLL_MS = 1_500;
const LOG_LOOKBACK_BLOCKS = 600n;
const RETRY_MS = 1_000;
const LIQUIDATE_GAS = 150_000n;
const MAX_FEED = 30;
const MAX_HISTORY = 20;

type Market = { lending: Address; pair: Address; vibeIsToken0: boolean };
type Snapshot = {
  entries: BookEntry[];
  reserves: LendingReserves;
  block: bigint;
  at: number;
};

const CONTRACT_TYPES = ['Position', 'VIBE'] as const;

const CONTRACT_SNIPPET = `struct Position {
    uint128 collateral; // low 128 bits
    uint128 debt;       // high 128 bits
}
mapping(address => Position) public positions; // slot 0

function liquidate(address borrower)
    external
    returns (uint256 reward)
{
    Position memory p = positions[borrower];
    require(p.collateral > 0, "no position");
    (uint256 vibeReserve, uint256 usdvReserve) = reserves();
    // collateral * price * 80% < debt
    require(
        p.collateral * usdvReserve * 8_000
            < p.debt * vibeReserve * 10_000,
        "healthy"
    );
    delete positions[borrower];
    reward = p.collateral * 500 / 10_000; // 5%
    VIBE.transfer(msg.sender, reward);
}`;

export function LiquidationsDemo() {
  return (
    <AccountEngineProvider>
      <LiquidationsDemoInner />
    </AccountEngineProvider>
  );
}

function LiquidationsDemoInner() {
  const engine = useAccountEngine();
  const acct = engine.acct;
  const [client, setClient] = useState<PublicClient | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [underwater, setUnderwater] = useState<Map<Address, Underwater>>(new Map());
  const [feed, setFeed] = useState<LiquidationEvent[]>([]);
  const [expiry, setExpiry] = useState<LiquidationExpiry>(15);
  const [selected, setSelected] = useState<Address | null>(null);
  const [attempt, setAttempt] = useState<LiquidationAttempt | null>(null);
  const [history, setHistory] = useState<LiquidationAttempt[]>([]);
  const [signerReady, setSignerReady] = useState(false);
  const [signerError, setSignerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rpcSendRef = useRef<RpcSend | null>(null);
  const attemptRef = useRef<LiquidationAttempt | null>(null);
  const attemptIdRef = useRef(0);
  const submittingRef = useRef(false);
  /** First-seen-liquidatable block per `borrower:collateral:debt`, kept after the position is gone. */
  const underwaterLogRef = useRef<Map<string, bigint>>(new Map());
  useEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);

  const signerAddress = engine.activeSigner?.kind === 'k1' ? (engine.activeSigner.address ?? null) : null;

  // Discover the shared pool and the VibeLend singleton.
  useEffect(() => {
    let cancelled = false;
    let retryId: number | undefined;
    const nextClient = makePublicClient(() => rpcSendRef.current);
    setClient(nextClient);
    const discover = async () => {
      try {
        const deployment = await probeSingleton(nextClient);
        const lending = deployment
          ? await probeLending(nextClient, deployment.tokenA, deployment.tokenB, deployment.pair)
          : null;
        if (cancelled) return;
        if (!deployment || !lending) {
          setSetupError(null);
          retryId = window.setTimeout(() => void discover(), RETRY_MS);
          return;
        }
        setMarket({
          lending,
          pair: deployment.pair,
          vibeIsToken0: vibeIsToken0(deployment),
        });
        setSetupError(null);
      } catch (err) {
        if (cancelled) return;
        setSetupError(err instanceof Error ? err.message : 'Could not reach shared Vibenet infrastructure.');
        retryId = window.setTimeout(() => void discover(), RETRY_MS);
      }
    };
    void discover();
    return () => {
      cancelled = true;
      if (retryId !== undefined) window.clearTimeout(retryId);
    };
  }, []);

  // Fund the in-browser K1 signer that pays for liquidations.
  useEffect(() => {
    if (!client || !signerAddress) {
      setSignerReady(false);
      setSignerError(signerAddress ? null : 'A K1 owner is required to sign EIP-1559 transactions.');
      return;
    }
    let cancelled = false;
    void (async () => {
      setSignerReady(false);
      setSignerError(null);
      try {
        let balance = await client.getBalance({ address: signerAddress });
        if (balance === 0n) {
          await vibenetApi.faucet.drip({ address: signerAddress }).catch(() => undefined);
          const deadline = Date.now() + 10_000;
          while (balance === 0n && Date.now() < deadline) {
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            balance = await client.getBalance({ address: signerAddress });
          }
        }
        if (cancelled) return;
        if (balance === 0n) throw new Error('The faucet top-up for your signer did not land.');
        setSignerReady(true);
      } catch (err) {
        if (!cancelled) setSignerError(err instanceof Error ? err.message : 'Could not prepare the signer.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, signerAddress]);

  // Follow the book on every head (WebSocket) or on a short poll.
  useEffect(() => {
    if (!client || !market) return;
    let cancelled = false;
    let inFlight = false;
    let pollId: number | undefined;
    let stream: ReturnType<typeof connectJsonRpcStream> | undefined;

    const sync = async (head?: bigint) => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const [book, block] = await Promise.all([
          readBook(client, market.lending),
          head === undefined ? client.getBlockNumber({ cacheTime: 0 }) : Promise.resolve(head),
        ]);
        if (cancelled) return;
        const at = Date.now();
        setSnapshot({ ...book, block, at });
        // Expire an armed validity tx past its bound, leaving two blocks for
        // the receipt poll to see an inclusion in the last valid block.
        const armed = attemptRef.current;
        if (armed?.status === 'armed' && armed.maxBlock !== undefined && block > armed.maxBlock + 2n) {
          attemptRef.current = { ...armed, status: 'expired' };
          setAttempt((a) => (a && a.id === armed.id && a.status === 'armed' ? { ...a, status: 'expired' } : a));
          trackValidityLiquidation('validity', 'expired');
        }
        setUnderwater((previous) => {
          const next = trackUnderwater(
            previous,
            book.entries.map((entry) => ({
              ...entry,
              liquidatable: isLiquidatable(entry, book.reserves),
            })),
            block,
          );
          const log = underwaterLogRef.current;
          for (const [borrower, seen] of next) {
            const key = `${borrower}:${seen.key}`;
            if (!log.has(key)) log.set(key, seen.block);
          }
          // A position that recovered restarts its under-water clock.
          for (const entry of book.entries) {
            if (!isLiquidatable(entry, book.reserves)) log.delete(`${entry.borrower}:${positionKey(entry)}`);
          }
          while (log.size > 200) log.delete(log.keys().next().value!);
          return next;
        });
      } catch {
        // Keep the last snapshot while the feed reconnects.
      } finally {
        inFlight = false;
      }
    };

    const startPoll = () => {
      if (pollId !== undefined) return;
      rpcSendRef.current = null;
      void sync();
      pollId = window.setInterval(() => void sync(), POLL_MS);
    };

    if (VIBENET_WS_URL) {
      const wsUrl = VIBENET_WS_URL;
      void (async () => {
        stream = connectJsonRpcStream(wsUrl);
        stream.setOnClose(() => {
          rpcSendRef.current = null;
          if (!cancelled) startPoll();
        });
        await stream.ready;
        rpcSendRef.current = (method, params) => stream!.request(method, params);
        await stream.subscribe(['newHeads'], (raw) => {
          const block = headNumber(raw as StreamHead);
          if (block !== null) void sync(block);
        });
        if (cancelled) stream.close();
        else void sync();
      })().catch(() => {
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
      stream?.close();
    };
  }, [client, market]);

  // Liquidation feed from Liquidated events.
  useEffect(() => {
    if (!client || !market) return;
    let cancelled = false;
    let from: bigint | null = null;
    const poll = async () => {
      try {
        const head = await client.getBlockNumber({ cacheTime: 0 });
        const fromBlock: bigint = from ?? (head > LOG_LOOKBACK_BLOCKS ? head - LOG_LOOKBACK_BLOCKS : 0n);
        if (fromBlock > head) return;
        const logs = await client.getContractEvents({
          address: market.lending,
          abi: vibeLendAbi,
          eventName: 'Liquidated',
          fromBlock,
          toBlock: head,
        });
        if (cancelled) return;
        from = head + 1n;
        if (logs.length === 0) return;
        const events = logs.map((log) => {
          const args = (
            log as unknown as {
              args: {
                borrower: Address;
                liquidator: Address;
                collateral: bigint;
                debt: bigint;
                reward: bigint;
              };
            }
          ).args;
          const key = `${args.borrower}:${positionKey({ collateral: args.collateral, debt: args.debt })}`;
          return {
            ...args,
            block: log.blockNumber ?? head,
            txHash: log.transactionHash as Hex,
            underwaterBlock: underwaterLogRef.current.get(key),
          } satisfies LiquidationEvent;
        });
        setFeed((previous) => {
          const seen = new Set<string>();
          return [...events, ...previous]
            .filter((event) => {
              const id = `${event.txHash}:${event.borrower}`;
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            })
            .sort((a, b) => (a.block === b.block ? 0 : a.block > b.block ? -1 : 1))
            .slice(0, MAX_FEED);
        });
      } catch {
        // Retry on the next tick.
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), LOG_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [client, market]);

  // Someone else liquidated the position we were targeting.
  useEffect(() => {
    const current = attemptRef.current;
    if (!current || !signerAddress || (current.status !== 'armed' && current.status !== 'signing')) return;
    const rival = feed.find(
      (event) =>
        event.borrower.toLowerCase() === current.borrower.toLowerCase() &&
        event.liquidator.toLowerCase() !== signerAddress.toLowerCase() &&
        event.block >= current.submittedBlock,
    );
    if (!rival) return;
    setAttempt((a) => (a && a.id === current.id ? { ...a, status: 'beaten', includedBlock: rival.block } : a));
    trackValidityLiquidation(current.kind, 'beaten');
  }, [feed, signerAddress]);

  // Receipts for our attempt.
  const settle = useCallback(
    (id: number, status: 'success' | 'reverted', includedBlock: bigint, reward: bigint | undefined) => {
      setAttempt((a) => {
        if (!a || a.id !== id || (isSettled(a.status) && a.status !== 'expired')) return a;
        const underwaterBlock =
          a.underwaterBlock ?? underwaterLogRef.current.get(`${a.borrower}:${positionKey(a.position)}`);
        return { ...a, status, includedBlock, underwaterBlock, reward };
      });
    },
    [],
  );

  useEffect(() => {
    if (
      !client ||
      !attempt?.hash ||
      (attempt.status !== 'armed' && attempt.status !== 'pending' && attempt.status !== 'expired')
    )
      return;
    // Expired attempts get a short grace window for a receipt from the last valid block.
    const { hash, id, kind } = attempt;
    let cancelled = false;
    const poll = () => {
      void client
        .getTransactionReceipt({ hash })
        .then((receipt) => {
          if (cancelled) return;
          const status = receipt.status === 'success' ? 'success' : 'reverted';
          const [liquidated] = parseEventLogs({
            abi: vibeLendAbi,
            eventName: 'Liquidated',
            logs: receipt.logs,
          });
          const reward = (liquidated as { args?: { reward?: bigint } } | undefined)?.args?.reward;
          settle(id, status, receipt.blockNumber, reward);
          trackValidityLiquidation(kind, status);
        })
        .catch(() => {});
    };
    poll();
    const intervalId = window.setInterval(poll, RECEIPT_POLL_MS);
    const stopId =
      attempt.status === 'expired' ? window.setTimeout(() => window.clearInterval(intervalId), 5_000) : undefined;
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      if (stopId !== undefined) window.clearTimeout(stopId);
    };
  }, [attempt?.hash, attempt?.id, attempt?.kind, attempt?.status, client, settle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset per-account state on account switch.
  const accountKeyRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const key = acct?.id ?? null;
    if (accountKeyRef.current === undefined) {
      accountKeyRef.current = key;
      return;
    }
    if (accountKeyRef.current === key) return;
    accountKeyRef.current = key;
    setAttempt(null);
    setHistory([]);
    setError(null);
  }, [acct]);

  const head = snapshot?.block ?? null;
  const canStart = Boolean(acct && client && market && signerReady && snapshot) && nonceFree(attempt, head);

  const submit = async (kind: AttemptKind, borrower: Address) => {
    if (submittingRef.current || !client || !market || !canStart) return;
    submittingRef.current = true;
    setError(null);
    try {
      const [book, block] = await Promise.all([
        readBook(client, market.lending),
        client.getBlockNumber({ cacheTime: 0 }),
      ]);
      const entry = book.entries.find((e) => e.borrower.toLowerCase() === borrower.toLowerCase());
      if (!entry) {
        setError('That position is already gone. Pick another one.');
        return;
      }
      const position = { collateral: entry.collateral, debt: entry.debt };
      const id = ++attemptIdRef.current;
      const base: LiquidationAttempt = {
        id,
        kind,
        borrower,
        position,
        status: 'signing',
        submittedAt: Date.now(),
        submittedBlock: block,
        underwaterBlock: underwaterLogRef.current.get(`${borrower}:${positionKey(position)}`),
      };
      const previous = attemptRef.current;
      if (previous) setHistory((h) => [previous, ...h].slice(0, MAX_HISTORY));

      let predicates;
      if (kind === 'validity') {
        const maxBlock = maxBlockForExpiry(block, expiry);
        const validity = liquidationValidity({
          lending: market.lending,
          pair: market.pair,
          vibeIsToken0: market.vibeIsToken0,
          borrower,
          position,
          reserves: book.reserves,
          maxBlock,
        });
        predicates = validity.predicates;
        base.maxBlock = maxBlock;
        base.triggerPriceWad = validity.ceilingPriceWad;
        base.predicates = predicates;
      }
      setAttempt(base);
      setSelected(borrower);

      const serialized = await signK1Eip1559Call({
        client,
        signer: engine.activeSigner,
        call: encodeLiquidate(market.lending, borrower),
        gas: LIQUIDATE_GAS,
      });
      const hash = predicates
        ? await sendValidityTransaction(serialized, predicates)
        : await client.sendRawTransaction({
            serializedTransaction: serialized,
          });
      setAttempt((a) => (a && a.id === id ? { ...a, hash, status: kind === 'validity' ? 'armed' : 'pending' } : a));
      trackValidityLiquidation(kind, 'submitted');
    } catch (err) {
      const message = describeValidityError(err);
      setAttempt((a) => (a && a.status === 'signing' ? { ...a, status: 'error', error: message } : a));
      setError(message);
      trackValidityLiquidation(kind, 'error');
    } finally {
      submittingRef.current = false;
    }
  };

  const rows = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.entries
      .map((entry) => ({
        ...entry,
        health: healthFactorWad(entry, snapshot.reserves),
        liquidatable: isLiquidatable(entry, snapshot.reserves),
        liquidationPrice: liquidationPriceWad(entry),
        reward: liquidationReward(entry),
      }))
      .sort((a, b) => (a.health < b.health ? -1 : a.health > b.health ? 1 : 0));
  }, [snapshot]);

  const spot = snapshot ? spotPriceWad(snapshot.reserves) : null;
  const focus = selected && rows.some((row) => row.borrower === selected) ? selected : (rows[0]?.borrower ?? null);
  const focusRow = rows.find((row) => row.borrower === focus) ?? null;
  const armedFor = attempt && (attempt.status === 'armed' || attempt.status === 'signing') ? attempt.borrower : null;

  const earned = totalEarned([attempt, ...history]);
  const earnedByValidity = totalEarned([attempt, ...history], 'validity');
  const underwaterCount = rows.filter((row) => row.liquidatable).length;

  const previewPredicates =
    attempt?.predicates ??
    (focusRow && market && snapshot
      ? liquidationValidity({
          lending: market.lending,
          pair: market.pair,
          vibeIsToken0: market.vibeIsToken0,
          borrower: focusRow.borrower,
          position: focusRow,
          reserves: snapshot.reserves,
          maxBlock: maxBlockForExpiry(snapshot.block, expiry),
        }).predicates
      : null);

  const status = !market
    ? setupError
      ? `Shared infrastructure is not ready; retrying. ${setupError}`
      : 'Waiting for the shared VibeLend market'
    : !signerReady
      ? (signerError ?? 'Funding your signer from the faucet')
      : null;

  const yours = feed.filter((event) => signerAddress && event.liquidator.toLowerCase() === signerAddress.toLowerCase());
  const others = feed.length - yours.length;

  return (
    <AccountDemoShell
      gateTitle="Create an account to liquidate"
      gateDescription="Your active account signs and pays for liquidations."
      className="gap-6 pb-24"
    >
      <DemoHeader
        eyebrow="Validity Transactions · live market"
        title="Liquidations"
        description="Borrowers keep VIBE-backed loans open while the price swings. Liquidate them before a rival keeper does, either by hand or with a validity transaction that waits in the sequencer for the position to go under water."
      />

      <Card className="min-w-0 overflow-hidden bg-background p-5 sm:p-6 dark:bg-white/[.04]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-bds-gray-10 dark:lg:divide-white/10">
          <StatCell label="Oracle price" value={spot === null ? '—' : `$${formatPrice(spot, 5)}`} emphasis />
          <StatCell label="Block" value={head === null ? '—' : `#${head.toLocaleString()}`} />
          <StatCell label="Open positions" value={snapshot ? String(rows.length) : '—'} />
          <StatCell label="Under water" value={snapshot ? String(underwaterCount) : '—'} />
          <StatCell label="VIBE earned (validity)" value={formatTokenAmount(earnedByValidity, VIBE_DECIMALS)} />
        </div>
        <Text variant="footnote" tone="muted" className="mt-5 border-t border-bds-gray-10 pt-4 dark:border-white/10">
          There is no dedicated price oracle. VibeLend reads the spot price straight from the VIBE/USDV AMM pool
          reserves, which is what lets a validity predicate on the pool&apos;s storage stand in for the price check.
        </Text>
      </Card>

      <Card className="min-w-0 overflow-hidden bg-background p-5 sm:p-6 dark:bg-white/[.04]">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col">
            <Text variant="caption" tone="muted">
              Your liquidator
            </Text>
            <Text as="h2" variant="title2" className="mt-2">
              Arm ahead, or react.
            </Text>
            <Text variant="label.regular" tone="muted" className="mt-2">
              The rival keeper liquidates about three seconds after a position goes under water. A validity liquidation
              is already in the sequencer&apos;s pool, so it can land in the first block the price allows.
            </Text>

            <div className="mt-5">
              <Text variant="caption" tone="muted">
                Validity expiry
              </Text>
              <div className="mt-2 flex gap-2">
                {LIQUIDATION_EXPIRY_OPTIONS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => setExpiry(seconds)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 font-mono text-[12px] transition-colors',
                      expiry === seconds
                        ? 'border-base-blue bg-bds-blue-0 text-base-blue dark:bg-[#0c1222]'
                        : 'border-bds-gray-15 text-bds-gray-70 hover:border-bds-gray-30 dark:border-white/10 dark:text-white/60',
                    )}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => focus && void submit('validity', focus)} disabled={!canStart || !focus}>
                Arm {focus ? shortAddress(focus) : 'riskiest'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => focus && void submit('manual', focus)}
                disabled={!canStart || !focus}
              >
                Liquidate now
              </Button>
            </div>
            {attempt &&
            !nonceFree(attempt, head) &&
            attempt.status === 'beaten' &&
            attempt.maxBlock !== undefined &&
            head !== null ? (
              <Text variant="footnote" tone="muted" className="mt-2">
                Your beaten transaction holds its nonce until block #{attempt.maxBlock.toString()} (
                {formatSeconds(attempt.maxBlock - head)}).
              </Text>
            ) : null}
            {error ? (
              <Text variant="footnote" className="mt-3 text-red-600 dark:text-red-300">
                {error}
              </Text>
            ) : null}
          </div>

          <div className="flex flex-col justify-center rounded-xl border border-dashed border-bds-gray-15 bg-bds-gray-5/50 p-5 dark:border-white/10 dark:bg-white/[.02]">
            {attempt ? (
              <AttemptPanel attempt={attempt} head={head} />
            ) : (
              <Text variant="label.regular" tone="muted">
                {status ??
                  'Pick a position in the book below. Arm a validity liquidation on it, then watch whether it beats the keeper.'}
              </Text>
            )}
          </div>
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden bg-background p-5 sm:p-6 dark:bg-white/[.04]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <Text variant="caption" tone="muted">
              VibeLend book
            </Text>
            <Text variant="headline" className="mt-1">
              Liquidatable below 80% loan-to-value. Reward: 5% of collateral.
            </Text>
          </div>
          <Text variant="footnote" tone="muted">
            Sorted by health factor
          </Text>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="text-bds-gray-50 dark:text-white/40">
                <th className="py-2 pr-3 font-normal">Borrower</th>
                <th className="py-2 pr-3 font-normal">Collateral</th>
                <th className="py-2 pr-3 font-normal">Debt</th>
                <th className="py-2 pr-3 font-normal">Liquidation price</th>
                <th className="py-2 pr-3 font-normal">Health</th>
                <th className="py-2 pr-3 font-normal">Reward</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-bds-gray-10 dark:divide-white/10">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-bds-gray-50 dark:text-white/40">
                    {snapshot
                      ? 'No open positions right now. Borrowers reopen within a few seconds.'
                      : 'Loading the book…'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.borrower}
                    onClick={() => setSelected(row.borrower)}
                    className={cn('cursor-pointer', row.borrower === focus && 'bg-bds-blue-0 dark:bg-[#0c1222]')}
                  >
                    <td className="py-2.5 pr-3 font-mono">
                      {shortAddress(row.borrower)}
                      {row.borrower === armedFor ? <span className="ml-2 text-base-blue">armed</span> : null}
                    </td>
                    <td className="py-2.5 pr-3 font-mono">{formatTokenAmount(row.collateral, VIBE_DECIMALS)} VIBE</td>
                    <td className="py-2.5 pr-3 font-mono">{formatTokenAmount(row.debt, USDV_DECIMALS)} USDV</td>
                    <td className="py-2.5 pr-3 font-mono">${formatPrice(row.liquidationPrice, 5)}</td>
                    <td className="py-2.5 pr-3">
                      <HealthBar health={row.health} liquidatable={row.liquidatable} />
                    </td>
                    <td className="py-2.5 pr-3 font-mono">{formatTokenAmount(row.reward, VIBE_DECIMALS)} VIBE</td>
                    <td className="py-2.5 text-right">
                      {row.liquidatable ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[12px] text-red-700 dark:bg-red-500/15 dark:text-red-300">
                          Under water
                          {underwater.get(row.borrower) && head !== null
                            ? ` · ${formatSeconds(head - underwater.get(row.borrower)!.block)}`
                            : ''}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="flex min-h-0 flex-col overflow-hidden bg-background p-5 sm:p-6 dark:bg-white/[.04]">
          <div className="flex items-baseline justify-between">
            <Text variant="caption" tone="muted">
              Your attempts
            </Text>
            <Text variant="footnote" tone="muted">
              {(attempt ? 1 : 0) + history.length} total · {formatTokenAmount(earned, VIBE_DECIMALS)} VIBE earned
            </Text>
          </div>
          <div className="mt-3 max-h-80 divide-y divide-bds-gray-10 overflow-y-auto dark:divide-white/10">
            {!attempt && history.length === 0 ? (
              <Text variant="label.regular" tone="muted" className="py-4">
                No attempts yet.
              </Text>
            ) : (
              [attempt, ...history]
                .filter((a): a is LiquidationAttempt => a !== null)
                .map((a) => <AttemptRow key={a.id} attempt={a} />)
            )}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden bg-background p-5 sm:p-6 dark:bg-white/[.04]">
          <div className="flex items-baseline justify-between">
            <Text variant="caption" tone="muted">
              Recent liquidations
            </Text>
            <Text variant="footnote" tone="muted">
              You {yours.length} · others {others}
            </Text>
          </div>
          <div className="mt-3 max-h-80 divide-y divide-bds-gray-10 overflow-y-auto dark:divide-white/10">
            {feed.length === 0 ? (
              <Text variant="label.regular" tone="muted" className="py-4">
                No liquidations in the last two minutes.
              </Text>
            ) : (
              feed.map((event) => {
                const mine = Boolean(signerAddress && event.liquidator.toLowerCase() === signerAddress.toLowerCase());
                const delay = blocksUnderwater(event.underwaterBlock, event.block);
                return (
                  <div
                    key={`${event.txHash}-${event.borrower}`}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <Text variant="label" className="truncate">
                        {shortAddress(event.borrower)} by {mine ? 'you' : shortAddress(event.liquidator)}
                        <span className="ml-2 font-mono text-[12px] text-bds-gray-50 dark:text-white/40">
                          {formatTokenAmount(event.reward, VIBE_DECIMALS)} VIBE
                        </span>
                      </Text>
                      <Text variant="footnote" tone="muted" className="mt-0.5 truncate">
                        Block #{event.block.toLocaleString()}
                        {delay !== null ? ` · ${delay.toString()} blocks under water` : ''}
                      </Text>
                    </div>
                    <a
                      href={`${VIBENET_EXPLORER_PATH}/tx/${event.txHash}`}
                      className={cn(
                        'shrink-0 rounded-full px-3 py-1.5 font-mono text-[12px]',
                        mine
                          ? 'bg-bds-green-10 text-bds-green-80 dark:bg-bds-green-80/30 dark:text-[#b8f7d1]'
                          : 'bg-bds-gray-10 text-bds-gray-70 dark:bg-white/10 dark:text-white/60',
                      )}
                    >
                      {event.txHash.slice(0, 10)}…
                    </a>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </section>

      <details className="group rounded-2xl border border-bds-gray-10 bg-background dark:border-white/10 dark:bg-white/[.04]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none sm:px-6 [&::-webkit-details-marker]:hidden">
          <div>
            <Text variant="caption" tone="muted">
              Advanced details
            </Text>
            <Text variant="headline" className="mt-1">
              Contract and validity predicates
            </Text>
          </div>
          <ChevronIcon className="shrink-0 duration-150 group-open:rotate-180" />
        </summary>
        <div className="border-t border-bds-gray-10 px-5 py-5 sm:px-6 dark:border-white/10">
          <div className="grid max-w-3xl gap-3">
            <Text variant="label.regular" tone="muted">
              The sequencer can compare a storage word against a constant, but it cannot divide one reserve by the
              other. The pool charges no fee and no one removes liquidity, so its constant product{' '}
              <code className="font-mono">k</code> never falls. That turns the price condition into a bound on the USDV
              reserve alone. Once
            </Text>
            <code className="block overflow-x-auto rounded-lg bg-bds-gray-5 px-3 py-2 font-mono text-[12px] text-bds-gray-80 dark:bg-[#0b0d12] dark:text-[#d6deeb]">
              usdvReserve² · collateral · 8000 &lt; debt · 10000 · k
            </code>
            <Text variant="label.regular" tone="muted">
              the position is liquidatable no matter how <code className="font-mono">k</code> has grown.
            </Text>
            <Text variant="label.regular" tone="muted">
              The second predicate pins the borrower&apos;s packed position word. If the keeper liquidates first, or the
              borrower closes or reopens, the word changes and the sequencer never includes your transaction, so it
              cannot revert and waste gas.
            </Text>
          </div>
          <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
            <CodeSnippet
              label="VibeLend.sol (excerpt)"
              code={CONTRACT_SNIPPET}
              language="solidity"
              types={CONTRACT_TYPES}
              className="max-h-[36rem]"
            />
            <CodeSnippet
              label={`Validity predicates${attempt?.predicates ? ' (your last attempt)' : focus ? ` for ${shortAddress(focus)}` : ''}`}
              code={previewPredicates ? prettyValidity(previewPredicates) : '// Waiting for an open position'}
              language={previewPredicates ? 'json' : 'solidity'}
              className="max-h-[36rem]"
            />
          </div>
          {market ? (
            <Text variant="footnote" tone="muted" className="mt-4 font-mono">
              VibeLend {market.lending}
            </Text>
          ) : null}
        </div>
      </details>
    </AccountDemoShell>
  );
}

function formatSeconds(blocks: bigint): string {
  const seconds = Number(blocks) * 0.2;
  return `${seconds.toFixed(1)}s`;
}

function AttemptPanel({ attempt, head }: { attempt: LiquidationAttempt; head: bigint | null }) {
  const delay = blocksUnderwater(attempt.underwaterBlock, attempt.includedBlock);
  const label =
    attempt.status === 'armed'
      ? attempt.triggerPriceWad !== undefined
        ? `Armed. Lands once the price is at or below $${formatPrice(attempt.triggerPriceWad, 5)}.`
        : 'Armed.'
      : attempt.status === 'signing'
        ? 'Signing…'
        : attempt.status === 'pending'
          ? 'Sent. Waiting for a receipt.'
          : attempt.status === 'success'
            ? `Liquidated in block #${attempt.includedBlock?.toLocaleString()}. You earned ${formatTokenAmount(attempt.reward ?? liquidationReward(attempt.position), VIBE_DECIMALS)} VIBE.`
            : attempt.status === 'beaten'
              ? 'Beaten. Someone else liquidated this position first; your transaction will never be included.'
              : attempt.status === 'expired'
                ? 'Expired. The price never reached the position’s trigger in time.'
                : attempt.status === 'reverted'
                  ? 'Reverted. The position was healthy again or already gone when your transaction landed.'
                  : (attempt.error ?? 'Failed.');
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Text variant="label">
          {attempt.kind === 'validity' ? 'Validity liquidation' : 'Manual liquidation'} ·{' '}
          {shortAddress(attempt.borrower)}
        </Text>
        <StatusPill status={attempt.status} />
      </div>
      <Text variant="label.regular" tone="muted">
        {label}
      </Text>
      {attempt.status === 'armed' && attempt.maxBlock !== undefined && head !== null ? (
        <Text variant="footnote" tone="muted">
          Expires at block #{attempt.maxBlock.toString()} (
          {formatSeconds(attempt.maxBlock > head ? attempt.maxBlock - head : 0n)} left)
        </Text>
      ) : null}
      {delay !== null && attempt.status === 'success' ? (
        <Text variant="footnote" tone="muted">
          Landed {delay.toString()} blocks after the position went under water.
        </Text>
      ) : null}
      {attempt.hash ? (
        <a
          href={`${VIBENET_EXPLORER_PATH}/tx/${attempt.hash}`}
          className="font-mono text-[12px] text-base-blue hover:underline dark:text-bds-blue-30"
        >
          {attempt.hash.slice(0, 18)}…
        </a>
      ) : null}
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: LiquidationAttempt }) {
  const delay = blocksUnderwater(attempt.underwaterBlock, attempt.includedBlock);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <Text variant="label">
          {attempt.kind === 'validity' ? 'Validity' : 'Manual'} · {shortAddress(attempt.borrower)}
        </Text>
        <Text variant="footnote" tone="muted" className="mt-0.5">
          {attempt.includedBlock !== undefined
            ? `Block #${attempt.includedBlock.toLocaleString()}${delay !== null && attempt.status === 'success' ? ` · ${delay.toString()} blocks under water` : ''}`
            : `Submitted at block #${attempt.submittedBlock.toLocaleString()}`}
        </Text>
      </div>
      <div className="flex items-center gap-3">
        {attempt.status === 'success' && attempt.reward !== undefined ? (
          <span className="font-mono text-[12px] text-bds-green-70 dark:text-[#7ee0a8]">
            +{formatTokenAmount(attempt.reward, VIBE_DECIMALS)} VIBE
          </span>
        ) : null}
        <StatusPill status={attempt.status} />
      </div>
    </div>
  );
}

function HealthBar({ health, liquidatable }: { health: bigint; liquidatable: boolean }) {
  const value = Number(health) / Number(WAD);
  // 1.0 → empty, 1.25+ → full.
  const fill = Math.max(0, Math.min(1, (value - 1) / 0.25));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bds-gray-10 dark:bg-white/10">
        <div
          className={cn(
            'h-full rounded-full',
            liquidatable ? 'bg-red-500' : fill < 0.3 ? 'bg-bds-orange-50' : 'bg-bds-green-50',
          )}
          style={{ width: `${liquidatable ? 100 : Math.max(fill * 100, 4)}%` }}
        />
      </div>
      <span className="font-mono">{value.toFixed(3)}</span>
    </div>
  );
}

function StatusPill({ status }: { status: LiquidationAttempt['status'] }) {
  const positive = status === 'success';
  const negative = status === 'reverted' || status === 'expired' || status === 'error' || status === 'beaten';
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1.5 text-[12px] capitalize',
        positive
          ? 'bg-bds-green-10 text-bds-green-80 dark:bg-bds-green-80/30 dark:text-[#b8f7d1]'
          : negative
            ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
            : 'bg-bds-gray-10 text-bds-gray-70 dark:bg-white/10 dark:text-white/60',
      )}
    >
      {status}
    </span>
  );
}

function StatCell({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0 lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="headline" className={cn('mt-1.5 truncate font-mono', emphasis && 'font-semibold')}>
        {value}
      </Text>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="label.mono" className="mt-1 truncate">
        {value}
      </Text>
    </div>
  );
}
