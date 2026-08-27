import type { Address } from 'viem';

import { WAD } from './constants';
import { priceWad } from './predicates';
import type { Deployment, Side } from './types';

export const VIBE_NAME = 'VIBE';
export const VIBE_SYMBOL = 'VIBE';
export const USDV_NAME = 'Vibe USD';
export const USDV_SYMBOL = 'USDV';

export function vibeIsToken0(deployment: Pick<Deployment, 'token0' | 'tokenA'>): boolean {
  return deployment.token0.toLowerCase() === deployment.tokenA.toLowerCase();
}

/** USDV per VIBE. tokenA is always VIBE, tokenB is always USDV. */
export function quoteWad(
  reserve0: bigint,
  reserve1: bigint,
  vibeToken0: boolean,
): bigint {
  return vibeToken0 ? priceWad(reserve0, reserve1) : priceWad(reserve1, reserve0);
}

export function ammPriceFromQuote(quote: bigint, vibeToken0: boolean): bigint {
  if (vibeToken0) return quote;
  if (quote === 0n) return 0n;
  return (WAD * WAD) / quote;
}

export function ammSide(side: Side, vibeToken0: boolean): Side {
  if (vibeToken0) return side;
  return side === 'buy' ? 'sell' : 'buy';
}

export function quoteFromAmmPrice(amm: bigint, vibeToken0: boolean): bigint {
  return ammPriceFromQuote(amm, vibeToken0);
}

export function vibeReserve(reserve0: bigint, reserve1: bigint, vibeToken0: boolean): bigint {
  return vibeToken0 ? reserve0 : reserve1;
}

export function usdvReserve(reserve0: bigint, reserve1: bigint, vibeToken0: boolean): bigint {
  return vibeToken0 ? reserve1 : reserve0;
}

export function swapOuts(args: {
  vibeToken0: boolean;
  sellVibe: boolean;
  amountOut: bigint;
}): { amount0Out: bigint; amount1Out: bigint } {
  const { vibeToken0, sellVibe, amountOut } = args;
  if (sellVibe) {
    return vibeToken0
      ? { amount0Out: 0n, amount1Out: amountOut }
      : { amount0Out: amountOut, amount1Out: 0n };
  }
  return vibeToken0
    ? { amount0Out: amountOut, amount1Out: 0n }
    : { amount0Out: 0n, amount1Out: amountOut };
}

export function tokenInFor(deployment: Deployment, sellVibe: boolean): Address {
  return sellVibe ? deployment.tokenA : deployment.tokenB;
}

/** USDV per VIBE from a Uni v2 Swap's in/out amounts. */
export function quoteFromSwapAmounts(args: {
  vibeToken0: boolean;
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
}): bigint | undefined {
  const vibeIn = args.vibeToken0 ? args.amount0In : args.amount1In;
  const vibeOut = args.vibeToken0 ? args.amount0Out : args.amount1Out;
  const usdvIn = args.vibeToken0 ? args.amount1In : args.amount0In;
  const usdvOut = args.vibeToken0 ? args.amount1Out : args.amount0Out;
  if (vibeOut > 0n && usdvIn > 0n) return (usdvIn * WAD) / vibeOut;
  if (vibeIn > 0n && usdvOut > 0n) return (usdvOut * WAD) / vibeIn;
  return undefined;
}

/** Mid before a Swap, reconstructed from post-swap Sync + Swap amounts. */
export function quoteFromPreSwapReserves(args: {
  vibeToken0: boolean;
  postReserve0: bigint;
  postReserve1: bigint;
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
}): bigint | undefined {
  const r0 = args.postReserve0 + args.amount0Out - args.amount0In;
  const r1 = args.postReserve1 + args.amount1Out - args.amount1In;
  if (r0 <= 0n || r1 <= 0n) return undefined;
  return quoteWad(r0, r1, args.vibeToken0);
}

/** Never plot a buy above the condition or a sell below it. */
export function clampToCondition(side: Side, quote: bigint, target: bigint): bigint {
  if (side === 'buy') return quote <= target ? quote : target;
  return quote >= target ? quote : target;
}
