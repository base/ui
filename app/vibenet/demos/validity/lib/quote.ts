import type { Address } from 'viem';

import { WAD } from './constants';
import { priceWad } from './predicates';
import type { Deployment, Side } from './types';

export const VIBE_NAME = 'VIBE';
export const VIBE_SYMBOL = 'VIBE';
export const USDV_NAME = 'Vibe USD';
export const USDV_SYMBOL = 'USDV';

/** Whole tokens with grouping; two decimals only when there is dust. */
export function formatTokenAmount(wad: bigint): string {
  const negative = wad < 0n;
  const abs = negative ? -wad : wad;
  const whole = abs / WAD;
  const frac = ((abs % WAD) * 100n) / WAD;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac === 0n ? grouped : `${grouped}.${frac.toString().padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

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
