import { parseEther, type Address, type Hex } from 'viem';

import { amountOut, encodeSwapLegs } from './amm';
import {
  quoteWad,
  swapOuts,
  tokenInFor,
  usdvReserve,
  vibeIsToken0,
  vibeReserve,
} from './quote';
import type { Deployment, Reserves } from './types';

const ANCHOR = 0.07;
const SLOW_PERIOD_MS = 24_000;
const SLOW_AMPLITUDE = 0.05;
const FAST_PERIOD_MS = 3_000;
const FAST_AMPLITUDE = 0.012;
const PRICE_MOVE = 0.01;
const HARD_LO = 0.01;
const HARD_HI = 1;
/** One maker swap per second is enough to walk the mid. */
const TICK_MS = 1_000;
export const BOT_GAS_FLOOR = parseEther('0.002');
/** Ignore gas-low while a maker swap just landed — balances can lag the send. */
export const MAKER_DRY_GRACE_MS = 2_500;
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

/**
 * Banner only after the simulation has swapped and then every known maker
 * balance is below the floor. `lastSwapAt === 0` means no swap yet — empty,
 * null, or pre-fund 0n readings must not look like "ran out of ETH".
 */
export function shouldFlagMakersDry(
  balances: readonly (bigint | null)[],
  makerCount: number,
  lastSwapAt: number,
  now = Date.now(),
): boolean {
  if (lastSwapAt === 0 || now - lastSwapAt < MAKER_DRY_GRACE_MS) return false;
  if (makerCount <= 0) return false;
  const known = balances.filter((value): value is bigint => value !== null);
  return known.length === makerCount && allNeedGas(known);
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

export type MakerSwapCalls = { to: Address; data: Hex }[];

/**
 * One ~1% swap per second toward a shared USDV/VIBE target. Reserves, gas, and
 * inventory come from the demo sync so this loop does not add its own reads.
 */
export function startBots(args: {
  addresses: Address[];
  deployment: Deployment;
  reserves: () => Reserves | null;
  ethBalance: (index: number) => bigint | null;
  tokenBalance: (index: number, token: Address) => bigint | null;
  sendSwap: (index: number, calls: MakerSwapCalls) => Promise<void>;
  enabled: () => boolean;
  onPrice?: (price: number) => void;
  onError?: (message: string) => void;
  onGasLow?: () => void;
}): () => void {
  const {
    addresses,
    deployment,
    reserves: readReserves,
    ethBalance,
    tokenBalance,
    sendSwap,
    enabled,
    onPrice,
    onError,
    onGasLow,
  } = args;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let turn = 0;
  let anchor = ANCHOR;
  let anchored = false;
  let lastGasLow = 0;
  const vibeToken0 = vibeIsToken0(deployment);

  const signalGasLow = () => {
    const now = Date.now();
    if (now - lastGasLow < GAS_LOW_MS) return;
    lastGasLow = now;
    onGasLow?.();
  };

  const tick = async (index: number) => {
    if (stopped || !enabled()) return;
    const eth = ethBalance(index);
    if (eth === null) return;
    if (botNeedsGas(eth)) {
      signalGasLow();
      return;
    }
    const latest = readReserves();
    if (!latest || latest.reserve0 === 0n || latest.reserve1 === 0n) return;
    const { reserve0, reserve1 } = latest;
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
    const bal = tokenBalance(index, tokenIn);
    if (bal === null) return;
    const used = amountIn <= bal ? amountIn : (bal * 8n) / 10n;
    if (used === 0n) throw new Error('maker inventory empty');
    const reserveIn = poolIn;
    const reserveOut = sellVibe
      ? usdvReserve(reserve0, reserve1, vibeToken0)
      : vibeReserve(reserve0, reserve1, vibeToken0);
    const exactOut = amountOut(used, reserveIn, reserveOut);
    const out = exactOut > 1n ? exactOut - 1n : exactOut;
    if (out === 0n) return;
    const outs = swapOuts({ vibeToken0, sellVibe, amountOut: out });
    await sendSwap(
      index,
      encodeSwapLegs({
        tokenIn,
        pair: deployment.pair,
        recipient: addresses[index],
        amountIn: used,
        amount0Out: outs.amount0Out,
        amount1Out: outs.amount1Out,
      }),
    );
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
      if (enabled() && addresses.length > 0) await tick(turn % addresses.length);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'maker swap failed';
      onError?.(message.split('\n')[0] ?? message);
    }
    turn += 1;
    if (!stopped) timer = setTimeout(loop, TICK_MS);
  };
  timer = setTimeout(loop, 400);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
