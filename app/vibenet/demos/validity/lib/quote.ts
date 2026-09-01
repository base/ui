import type { Address } from 'viem';

import { QUOTE_SCALE, USDV_DECIMALS, VIBE_DECIMALS, WAD } from './constants';
import type { Deployment, Side } from './types';

export const VIBE_NAME = 'VIBE';
export const VIBE_SYMBOL = 'VIBE';
export const USDV_SYMBOL = 'USDV';
export { USDV_DECIMALS };

/** Whole tokens with grouping; two decimals only when there is dust. */
export function formatTokenAmount(amount: bigint, decimals: number = VIBE_DECIMALS): string {
  const unit = 10n ** BigInt(decimals);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / unit;
  const frac = ((abs % unit) * 100n) / unit;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac === 0n ? grouped : `${grouped}.${frac.toString().padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

export function vibeIsToken0(deployment: Pick<Deployment, 'token0' | 'tokenA'>): boolean {
  return deployment.token0.toLowerCase() === deployment.tokenA.toLowerCase();
}

/** USDV-per-VIBE wad. VIBE is 18 decimals; faucet USDV is 6. */
export function quoteWad(
  reserve0: bigint,
  reserve1: bigint,
  vibeToken0: boolean,
): bigint {
  const vibe = vibeToken0 ? reserve0 : reserve1;
  const usdv = vibeToken0 ? reserve1 : reserve0;
  if (vibe === 0n) return 0n;
  return (usdv * QUOTE_SCALE) / vibe;
}

/** Human USDV/VIBE wad → Uni v2 `reserve1/reserve0` wad. */
export function ammPriceFromQuote(quote: bigint, vibeToken0: boolean): bigint {
  const raw = (quote * WAD) / QUOTE_SCALE;
  if (vibeToken0) return raw;
  if (raw === 0n) return 0n;
  return (WAD * WAD) / raw;
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
