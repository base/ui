import {
  encodeFunctionData,
  parseAbi,
  parseEventLogs,
  zeroAddress,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';

const factoryEvents = parseAbi([
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256 allPairsLength)',
]);

const pairEvents = parseAbi([
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  'event Sync(uint112 reserve0, uint112 reserve1)',
]);

import {
  SEED_USDV,
  SEED_VIBE,
  TRADER_USDV,
  TRADER_VIBE,
  WAD,
  erc20Abi,
  erc20Bytecode,
  factoryAbi,
  factoryBytecode,
  helperAbi,
  helperBytecode,
  pairAbi,
} from './constants';
import { sqrt } from './predicates';
import { quoteFromPreSwapReserves, USDV_NAME, USDV_SYMBOL, VIBE_NAME, VIBE_SYMBOL } from './quote';
import type { Deployment, Reserves, Side } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function wait(
  publicClient: PublicClient,
  hash: Hex,
): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 120_000,
    pollingInterval: 1_000,
  });
  if (receipt.status === 'reverted') {
    throw new Error(`Transaction reverted (${hash})`);
  }
  return receipt;
}

/** Zeronet query RPC is load-balanced; a receipt can land before bytecode is visible. */
async function waitForBytecode(
  publicClient: PublicClient,
  address: Address,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const code = await publicClient.getCode({ address }).catch(() => undefined);
    if (code && code !== '0x') return;
    await sleep(400);
  }
  throw new Error(`${label} bytecode not visible on the read RPC yet (${address}).`);
}

function pairFromCreateReceipt(receipt: TransactionReceipt): Address | null {
  const logs = parseEventLogs({
    abi: factoryEvents,
    eventName: 'PairCreated',
    logs: receipt.logs,
  });
  return logs[0]?.args.pair ?? null;
}

async function readPair(
  publicClient: PublicClient,
  factory: Address,
  tokenA: Address,
  tokenB: Address,
): Promise<Address> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const pair = (await publicClient.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: 'getPair',
        args: [tokenA, tokenB],
      })) as Address;
      if (pair && pair !== zeroAddress) return pair;
    } catch (err) {
      lastError = err;
    }
    await sleep(400);
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('Factory returned no pair.');
}

async function send(
  wallet: WalletClient,
  publicClient: PublicClient,
  account: Account,
  request: {
    to?: Address;
    data: Hex;
    gas?: bigint;
  },
): Promise<TransactionReceipt> {
  const hash = await wallet.sendTransaction({
    account,
    chain: wallet.chain,
    ...request,
  });
  return wait(publicClient, hash);
}

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
  const vibe = sqrt((k * WAD) / quoteWad);
  if (vibe === 0n) throw new Error('Degenerate reserve bound.');
  const usdv = (vibe * quoteWad) / WAD || 1n;
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

export async function deployAmm(args: {
  wallet: WalletClient;
  publicClient: PublicClient;
  account: Account;
  traders: Address[];
  onProgress?: (label: string) => void;
}): Promise<Deployment> {
  const { wallet, publicClient, account, traders, onProgress } = args;
  const note = (label: string) => onProgress?.(label);

  note('Deploying VIBE');
  const tokenAHash = await wallet.deployContract({
    abi: erc20Abi,
    bytecode: erc20Bytecode,
    args: [VIBE_NAME, VIBE_SYMBOL],
    account,
    chain: wallet.chain,
  });
  const tokenAReceipt = await wait(publicClient, tokenAHash);
  const tokenA = tokenAReceipt.contractAddress;
  if (!tokenA) throw new Error('VIBE deploy returned no address.');
  await waitForBytecode(publicClient, tokenA, 'VIBE');

  note('Deploying USDV');
  const tokenBHash = await wallet.deployContract({
    abi: erc20Abi,
    bytecode: erc20Bytecode,
    args: [USDV_NAME, USDV_SYMBOL],
    account,
    chain: wallet.chain,
  });
  const tokenBReceipt = await wait(publicClient, tokenBHash);
  const tokenB = tokenBReceipt.contractAddress;
  if (!tokenB) throw new Error('USDV deploy returned no address.');
  await waitForBytecode(publicClient, tokenB, 'USDV');

  note('Deploying Uniswap V2 factory');
  const factoryHash = await wallet.deployContract({
    abi: factoryAbi,
    bytecode: factoryBytecode,
    args: [account.address],
    account,
    chain: wallet.chain,
  });
  const factoryReceipt = await wait(publicClient, factoryHash);
  const factory = factoryReceipt.contractAddress;
  if (!factory) throw new Error('Factory deploy returned no address.');
  await waitForBytecode(publicClient, factory, 'Factory');

  note('Creating the pair');
  const createReceipt = await send(wallet, publicClient, account, {
    to: factory,
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: 'createPair',
      args: [tokenA, tokenB],
    }),
    gas: 5_000_000n,
  });
  const pair =
    pairFromCreateReceipt(createReceipt) ?? (await readPair(publicClient, factory, tokenA, tokenB));
  await waitForBytecode(publicClient, pair, 'Pair');

  const token0 = (await publicClient.readContract({
    address: pair,
    abi: pairAbi,
    functionName: 'token0',
  })) as Address;
  const token1 = (await publicClient.readContract({
    address: pair,
    abi: pairAbi,
    functionName: 'token1',
  })) as Address;

  note('Seeding VIBE/USDV (~$0.07)');
  const mintTo = (token: Address, to: Address, amount: bigint) =>
    send(wallet, publicClient, account, {
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'mint',
        args: [to, amount],
      }),
    });

  await mintTo(tokenA, account.address, SEED_VIBE);
  await mintTo(tokenB, account.address, SEED_USDV);
  await send(wallet, publicClient, account, {
    to: tokenA,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [pair, SEED_VIBE],
    }),
  });
  await send(wallet, publicClient, account, {
    to: tokenB,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [pair, SEED_USDV],
    }),
  });
  await send(wallet, publicClient, account, {
    to: pair,
    data: encodeFunctionData({
      abi: pairAbi,
      functionName: 'mint',
      args: [account.address],
    }),
    gas: 500_000n,
  });

  note('Deploying swap helper');
  const helperHash = await wallet.deployContract({
    abi: helperAbi,
    bytecode: helperBytecode,
    account,
    chain: wallet.chain,
  });
  const helperReceipt = await wait(publicClient, helperHash);
  const helper = helperReceipt.contractAddress;
  if (!helper) throw new Error('Swap helper deploy returned no address.');
  await waitForBytecode(publicClient, helper, 'Swap helper');

  note('Minting trader inventory');
  for (const recipient of traders) {
    await mintTo(tokenA, recipient, TRADER_VIBE);
    await mintTo(tokenB, recipient, TRADER_USDV);
  }

  note('Approving the helper');
  const max = 2n ** 256n - 1n;
  for (const token of [token0, token1] as const) {
    await send(wallet, publicClient, account, {
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [helper, max],
      }),
    });
  }

  return { tokenA, tokenB, token0, token1, factory, pair, helper };
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

export function encodeSwapLegs(args: {
  tokenIn: Address;
  pair: Address;
  recipient: Address;
  amountIn: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
}): { to: Address; data: Hex }[] {
  return [
    {
      to: args.tokenIn,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [args.pair, args.amountIn],
      }),
    },
    {
      to: args.pair,
      data: encodeFunctionData({
        abi: pairAbi,
        functionName: 'swap',
        args: [args.amount0Out, args.amount1Out, args.recipient, '0x'],
      }),
    },
  ];
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
