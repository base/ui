import { parseEther, type Account, type Address, type PublicClient, type WalletClient } from 'viem';

import { amountOut, getReserves, swapExactIn, tokenBalance } from './amm';
import {
  bumpReplacementFees,
  isInsufficientFunds,
  isNonceTooLow,
  isReplacementUnderpriced,
  type FeeFields,
} from './fees';
import {
  quoteWad,
  swapOuts,
  tokenInFor,
  usdvReserve,
  vibeIsToken0,
  vibeReserve,
} from './quote';
import type { Deployment } from './types';

const ANCHOR = 0.07;
const SLOW_PERIOD_MS = 24_000;
const SLOW_AMPLITUDE = 0.05;
const FAST_PERIOD_MS = 3_000;
const FAST_AMPLITUDE = 0.012;
const PRICE_MOVE = 0.01;
const HARD_LO = 0.01;
const HARD_HI = 1;
const TICK_MS = 240;
export const BOT_GAS_FLOOR = parseEther('0.002');
export const BOT_GAS_REFILL = parseEther('0.03');
export const USER_GAS_RESERVE = parseEther('0.008');
const GAS_LOW_MS = 4_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function botNeedsGas(balance: bigint, floor = BOT_GAS_FLOOR): boolean {
  return balance < floor;
}

export function allNeedGas(balances: readonly bigint[]): boolean {
  return balances.length > 0 && balances.every((balance) => botNeedsGas(balance));
}

/** ETH the trader can send a dry maker without stranding their own swaps. */
export function refuelValue(botBalance: bigint, userBalance: bigint): bigint {
  if (!botNeedsGas(botBalance)) return 0n;
  const room = userBalance > USER_GAS_RESERVE ? userBalance - USER_GAS_RESERVE : 0n;
  if (room === 0n) return 0n;
  const target = botBalance >= BOT_GAS_REFILL ? 0n : BOT_GAS_REFILL - botBalance;
  if (target === 0n) return 0n;
  return target < room ? target : room;
}

/**
 * Reserve-in fraction that moves Uni v2 mid by `move` (0.01 = 1%).
 * Because p ∝ 1/r0², a 1% price step is about 0.5% of the input reserve.
 */
export function fractionForPriceMove(move: number): number {
  const abs = clamp(Math.abs(move), 0.002, 0.2);
  return 1 / Math.sqrt(1 - abs) - 1;
}

/** Slow ±5% wander around the VIBE/USDV anchor, plus a faster ±1.2% wobble. */
export function makerTargetPrice(nowMs: number, anchor = ANCHOR): number {
  const slow = SLOW_AMPLITUDE * Math.sin((2 * Math.PI * nowMs) / SLOW_PERIOD_MS);
  const fast = FAST_AMPLITUDE * Math.sin((2 * Math.PI * nowMs) / FAST_PERIOD_MS + 0.6);
  return clamp(anchor * (1 + slow + fast), HARD_LO, HARD_HI);
}

export function planSwap(
  spot: number,
  desired: number,
  noise: number,
): { sellVibe: boolean; fraction: number } {
  const towardSellVibe = desired < spot;
  const stretched =
    spot <= HARD_LO * 1.2 || spot >= HARD_HI * 0.85 || Math.abs(spot - desired) / Math.max(desired, 1e-9) > 0.07;
  let sellVibe: boolean;
  if (stretched) {
    sellVibe = spot > desired;
  } else if (Math.random() < 0.78) {
    sellVibe = towardSellVibe;
  } else {
    sellVibe = !towardSellVibe;
  }
  const move = PRICE_MOVE * (1 + noise);
  return { sellVibe, fraction: fractionForPriceMove(move) };
}

/**
 * One ~1% swap per block toward a shared USDV/VIBE target.
 */
export function startBots(args: {
  publicClient: PublicClient;
  wallets: WalletClient[];
  accounts: Account[];
  deployment: Deployment;
  enabled: () => boolean;
  onPrice?: (price: number) => void;
  onError?: (message: string) => void;
  onGasLow?: () => void;
}): () => void {
  const { publicClient, wallets, accounts, deployment, enabled, onPrice, onError, onGasLow } = args;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let turn = 0;
  let anchor = ANCHOR;
  let anchored = false;
  let lastGasLow = 0;
  const nonces: Array<number | undefined> = [];
  const fees: Array<FeeFields | null> = [];
  const vibeToken0 = vibeIsToken0(deployment);

  const signalGasLow = () => {
    const now = Date.now();
    if (now - lastGasLow < GAS_LOW_MS) return;
    lastGasLow = now;
    onGasLow?.();
  };

  const sendSwap = async (
    index: number,
    tokenIn: Address,
    used: bigint,
    sellVibe: boolean,
    out: bigint,
  ) => {
    const outs = swapOuts({ vibeToken0, sellVibe, amountOut: out });
    const attempt = async (nextFees: FeeFields | null | undefined) =>
      swapExactIn({
        wallet: wallets[index],
        publicClient,
        account: accounts[index],
        pair: deployment.pair,
        tokenIn,
        amountIn: used,
        amount0Out: outs.amount0Out,
        amount1Out: outs.amount1Out,
        nonce: nonces[index],
        fees: nextFees,
        waitForReceipt: false,
      });

    try {
      return await attempt(fees[index]);
    } catch (err) {
      if (isReplacementUnderpriced(err)) {
        const base = fees[index] ?? {
          maxFeePerGas: 3_000_000_000n,
          maxPriorityFeePerGas: 1_500_000_000n,
        };
        const bumped = bumpReplacementFees(base);
        fees[index] = bumped;
        return await attempt(bumped);
      }
      throw err;
    }
  };

  const tick = async (index: number) => {
    if (stopped || !enabled()) return;
    const account = accounts[index];
    const eth = await publicClient.getBalance({ address: account.address });
    if (botNeedsGas(eth)) {
      signalGasLow();
      return;
    }
    const { reserve0, reserve1 } = await getReserves(publicClient, deployment.pair);
    if (reserve0 === 0n || reserve1 === 0n) return;
    const spot = Number(quoteWad(reserve0, reserve1, vibeToken0)) / 1e18;
    if (!Number.isFinite(spot) || spot <= 0) return;
    if (!anchored) {
      anchor = spot;
      anchored = true;
    }
    const noise = (Math.random() - 0.5) * 0.4;
    const { sellVibe, fraction } = planSwap(spot, makerTargetPrice(Date.now(), anchor), noise);
    const poolIn = sellVibe
      ? vibeReserve(reserve0, reserve1, vibeToken0)
      : usdvReserve(reserve0, reserve1, vibeToken0);
    const tokenIn = tokenInFor(deployment, sellVibe);
    const amountIn = (poolIn * BigInt(Math.floor(fraction * 10_000))) / 10_000n;
    if (amountIn === 0n) return;
    const bal = await tokenBalance(publicClient, tokenIn, account.address);
    const used = amountIn <= bal ? amountIn : (bal * 8n) / 10n;
    if (used === 0n) throw new Error('maker inventory empty');
    const reserveIn = poolIn;
    const reserveOut = sellVibe
      ? usdvReserve(reserve0, reserve1, vibeToken0)
      : vibeReserve(reserve0, reserve1, vibeToken0);
    const exactOut = amountOut(used, reserveIn, reserveOut);
    // 1 wei slack on a 0% fee pair so k stays on the validity hyperbola.
    const out = exactOut > 1n ? exactOut - 1n : exactOut;
    if (out === 0n) return;
    if (nonces[index] === undefined) {
      nonces[index] = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: 'pending',
      });
    }
    try {
      const result = await sendSwap(index, tokenIn, used, sellVibe, out);
      nonces[index] = result.nextNonce;
      fees[index] = null;
    } catch (err) {
      if (isNonceTooLow(err)) nonces[index] = undefined;
      if (isInsufficientFunds(err)) {
        fees[index] = null;
        signalGasLow();
        return;
      }
      throw err;
    }
    const nextVibe = sellVibe
      ? vibeReserve(reserve0, reserve1, vibeToken0) + used
      : vibeReserve(reserve0, reserve1, vibeToken0) - exactOut;
    const nextUsdv = sellVibe
      ? usdvReserve(reserve0, reserve1, vibeToken0) - exactOut
      : usdvReserve(reserve0, reserve1, vibeToken0) + used;
    if (nextVibe > 0n && nextUsdv > 0n) {
      const next0 = vibeToken0 ? nextVibe : nextUsdv;
      const next1 = vibeToken0 ? nextUsdv : nextVibe;
      const next = Number(quoteWad(next0, next1, vibeToken0)) / 1e18;
      if (Number.isFinite(next) && next > 0) onPrice?.(next);
    }
  };

  const loop = async () => {
    if (stopped) return;
    try {
      if (enabled() && accounts.length > 0) await tick(turn % accounts.length);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'maker swap failed';
      onError?.(message.split('\n')[0] ?? message);
    }
    turn += 1;
    if (!stopped) timer = setTimeout(loop, TICK_MS);
  };
  timer = setTimeout(loop, 200);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export type { Address };
