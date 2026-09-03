import {
  encodeFunctionData,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';

const pairEvents = parseAbi([
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  'event Sync(uint112 reserve0, uint112 reserve1)',
]);

import { QUOTE_SCALE, TRADER_USDV, TRADER_VIBE, erc20Abi, helperAbi, minterAbi, pairAbi } from './constants';
import { sqrt } from './predicates';
import { quoteFromPreSwapReserves } from './quote';
import type { Deployment, Reserves, Side } from './types';

export async function getReserves(publicClient: PublicClient, pair: Address): Promise<Reserves> {
  const result = (await publicClient.readContract({
    address: pair,
    abi: pairAbi,
    functionName: 'getReserves',
  })) as [bigint, bigint, number];
  return {
    reserve0: result[0],
    reserve1: result[1],
    blockTimestampLast: Number(result[2]),
  };
}

export function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;
  // 0% swap fee so k stays put; the validity rectangle is a patch on one hyperbola.
  const numerator = amountIn * reserveOut;
  const denominator = reserveIn + amountIn;
  return numerator / denominator;
}

/** Reserves on the current hyperbola at a USDV-per-VIBE quote. */
export function reservesAtQuote(k: bigint, quoteWad: bigint): { vibe: bigint; usdv: bigint } {
  if (k === 0n || quoteWad <= 0n) {
    throw new Error('Need a live pool and a positive target price.');
  }
  const vibe = sqrt((k * QUOTE_SCALE) / quoteWad);
  if (vibe === 0n) throw new Error('Degenerate reserve bound.');
  const usdv = (vibe * quoteWad) / QUOTE_SCALE || 1n;
  return { vibe, usdv };
}

/**
 * Output sized at the limit, not at submit-time spot. Resting buys locked against
 * the then-current (worse) curve would fill above the line once the box hit.
 */
export function amountOutAtLimit(
  amountIn: bigint,
  side: Side,
  k: bigint,
  targetQuoteWad: bigint,
): bigint {
  const { vibe, usdv } = reservesAtQuote(k, targetQuoteWad);
  return side === 'buy' ? amountOut(amountIn, usdv, vibe) : amountOut(amountIn, vibe, usdv);
}

/** Smallest `amountIn` that yields at least `wantOut` on a 0% curve. */
export function amountInForExactOut(wantOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (wantOut === 0n || reserveIn === 0n || reserveOut === 0n || wantOut >= reserveOut) return 0n;
  const den = reserveOut - wantOut;
  return (wantOut * reserveIn + den - 1n) / den;
}

/** Input so the swap is `vibeSize` VIBE at the limit curve. Sell spends VIBE; buy spends USDV. */
export function amountInForVibe(
  vibeSize: bigint,
  side: Side,
  k: bigint,
  targetQuoteWad: bigint,
): bigint {
  if (side === 'sell') return vibeSize;
  const { vibe, usdv } = reservesAtQuote(k, targetQuoteWad);
  return amountInForExactOut(vibeSize, usdv, vibe);
}

export function reservesFromSyncLog(log: {
  address: Address;
  topics: Hex[];
  data: Hex;
}): Reserves | undefined {
  try {
    const syncs = parseEventLogs({
      abi: pairEvents,
      eventName: 'Sync',
      logs: [log as never],
    });
    const sync = syncs[0];
    if (sync?.args.reserve0 === undefined || sync.args.reserve1 === undefined) return undefined;
    return { reserve0: sync.args.reserve0, reserve1: sync.args.reserve1, blockTimestampLast: 0 };
  } catch {
    return undefined;
  }
}

export function fillQuoteFromPairLogs(
  logs: { address: Address; topics: Hex[]; data: Hex }[],
  pair: Address,
  vibeToken0: boolean,
): bigint | undefined {
  try {
    const wanted = pair.toLowerCase();
    const swaps = parseEventLogs({
      abi: pairEvents,
      eventName: 'Swap',
      logs: logs as never,
    });
    const syncs = parseEventLogs({
      abi: pairEvents,
      eventName: 'Sync',
      logs: logs as never,
    });
    const swap = [...swaps].reverse().find((ev) => ev.address.toLowerCase() === wanted);
    const sync = [...syncs].reverse().find((ev) => ev.address.toLowerCase() === wanted);
    if (
      !swap ||
      swap.args.amount0In === undefined ||
      swap.args.amount1In === undefined ||
      swap.args.amount0Out === undefined ||
      swap.args.amount1Out === undefined
    ) {
      return undefined;
    }
    if (sync?.args.reserve0 !== undefined && sync.args.reserve1 !== undefined) {
      return quoteFromPreSwapReserves({
        vibeToken0,
        postReserve0: sync.args.reserve0,
        postReserve1: sync.args.reserve1,
        amount0In: swap.args.amount0In,
        amount1In: swap.args.amount1In,
        amount0Out: swap.args.amount0Out,
        amount1Out: swap.args.amount1Out,
      });
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function fillQuoteFromSwapReceipt(
  receipt: TransactionReceipt,
  pair: Address,
  vibeToken0: boolean,
): bigint | undefined {
  return fillQuoteFromPairLogs(receipt.logs, pair, vibeToken0);
}

export function encodeMint(
  token: Address,
  to: Address,
  amount: bigint,
  minter?: Address,
): { to: Address; data: Hex } {
  if (minter) {
    return {
      to: minter,
      data: encodeFunctionData({
        abi: minterAbi,
        functionName: 'mint',
        args: [token, to, amount],
      }),
    };
  }
  return {
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'mint',
      args: [to, amount],
    }),
  };
}

/** USDV for anyone who can buy. VIBE only for makers — traders start at 0. */
export async function inventoryMints(
  publicClient: PublicClient,
  deployment: Deployment,
  recipients: readonly { to: Address; mintVibe?: boolean }[],
): Promise<{ to: Address; data: Hex }[]> {
  const calls: { to: Address; data: Hex }[] = [];
  const floorVibe = TRADER_VIBE / 2n;
  const floorUsdv = TRADER_USDV / 2n;
  for (const { to, mintVibe } of recipients) {
    const [vibe, usdv] = await Promise.all([
      tokenBalance(publicClient, deployment.tokenA, to),
      tokenBalance(publicClient, deployment.tokenB, to),
    ]);
    if (mintVibe && vibe < floorVibe) {
      calls.push(encodeMint(deployment.tokenA, to, TRADER_VIBE, deployment.minter));
    }
    if (usdv < floorUsdv) calls.push(encodeMint(deployment.tokenB, to, TRADER_USDV));
  }
  return calls;
}

export function encodeApprove(token: Address, spender: Address): { to: Address; data: Hex } {
  return {
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, 2n ** 256n - 1n],
    }),
  };
}

export function encodeHelperSwap(args: {
  helper: Address;
  tokenIn: Address;
  pair: Address;
  amountIn: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
}): { to: Address; data: Hex } {
  return {
    to: args.helper,
    data: encodeFunctionData({
      abi: helperAbi,
      functionName: 'swap',
      args: [args.tokenIn, args.pair, args.amountIn, args.amount0Out, args.amount1Out],
    }),
  };
}

export async function tokenBalance(
  publicClient: PublicClient,
  token: Address,
  owner: Address,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  })) as bigint;
}

export async function helperApproveCalls(
  publicClient: PublicClient,
  deployment: Deployment,
  owner: Address,
): Promise<{ to: Address; data: Hex }[]> {
  const calls: { to: Address; data: Hex }[] = [];
  const min = 2n ** 255n;
  for (const token of [deployment.token0, deployment.token1] as const) {
    const allowance = (await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, deployment.helper],
    })) as bigint;
    if (allowance < min) calls.push(encodeApprove(token, deployment.helper));
  }
  return calls;
}
