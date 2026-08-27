import {
  encodeFunctionData,
  parseEventLogs,
  zeroAddress,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';

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
import { padFees, type FeeFields } from './fees';
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
    pollingInterval: 250,
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
    abi: factoryAbi,
    eventName: 'PairCreated',
    logs: receipt.logs,
  });
  const pair = logs[0]?.args?.pair;
  return typeof pair === 'string' ? pair : null;
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

export function fillQuoteFromSwapReceipt(
  receipt: TransactionReceipt,
  pair: Address,
  vibeToken0: boolean,
): bigint | undefined {
  try {
    const wanted = pair.toLowerCase();
    const swaps = parseEventLogs({
      abi: pairAbi,
      eventName: 'Swap',
      logs: receipt.logs,
    });
    const syncs = parseEventLogs({
      abi: pairAbi,
      eventName: 'Sync',
      logs: receipt.logs,
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

export async function deployAmm(args: {
  wallet: WalletClient;
  publicClient: PublicClient;
  account: Account;
  extraRecipients: Address[];
  onProgress?: (label: string) => void;
}): Promise<Deployment> {
  const { wallet, publicClient, account, extraRecipients, onProgress } = args;
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
  const recipients = [account.address, ...extraRecipients];
  for (const recipient of recipients) {
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

export async function swapExactIn(args: {
  wallet: WalletClient;
  publicClient: PublicClient;
  account: Account;
  pair: Address;
  tokenIn: Address;
  amountIn: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
  nonce?: number;
  waitForReceipt?: boolean;
  fees?: FeeFields | null;
}): Promise<{ hash: Hex; nextNonce: number; fees: FeeFields | null }> {
  const { wallet, publicClient, account, pair, tokenIn, amountIn, amount0Out, amount1Out } = args;
  const [nonce, estimated] = await Promise.all([
    args.nonce !== undefined
      ? Promise.resolve(args.nonce)
      : publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
    args.fees ? Promise.resolve(null) : publicClient.estimateFeesPerGas().catch(() => null),
  ]);
  const fees: FeeFields | null = args.fees
    ?? (estimated?.maxFeePerGas !== undefined && estimated.maxPriorityFeePerGas !== undefined
      ? padFees({ maxFeePerGas: estimated.maxFeePerGas, maxPriorityFeePerGas: estimated.maxPriorityFeePerGas })
      : null);
  const feeFields = fees ?? {};
  await wallet.sendTransaction({
    account,
    chain: wallet.chain,
    to: tokenIn,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [pair, amountIn],
    }),
    nonce,
    ...feeFields,
  });
  const hash = await wallet.sendTransaction({
    account,
    chain: wallet.chain,
    to: pair,
    data: encodeFunctionData({
      abi: pairAbi,
      functionName: 'swap',
      args: [amount0Out, amount1Out, account.address, '0x'],
    }),
    nonce: nonce + 1,
    gas: 300_000n,
    ...feeFields,
  });
  if (args.waitForReceipt !== false) await wait(publicClient, hash);
  return { hash, nextNonce: nonce + 2, fees };
}

export async function tokenAllowance(
  publicClient: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  })) as bigint;
}

export async function approveMax(args: {
  wallet: WalletClient;
  publicClient: PublicClient;
  account: Account;
  token: Address;
  spender: Address;
}): Promise<void> {
  const { wallet, publicClient, account, token, spender } = args;
  await send(wallet, publicClient, account, {
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, 2n ** 256n - 1n],
    }),
  });
}

/** One-tx swap through SwapHelper (bots need a prior approve). */
export async function swapExactInHelper(args: {
  wallet: WalletClient;
  publicClient: PublicClient;
  account: Account;
  helper: Address;
  pair: Address;
  tokenIn: Address;
  amountIn: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
}): Promise<Hex> {
  const call = encodeHelperSwap(args);
  const receipt = await send(args.wallet, args.publicClient, args.account, {
    to: call.to,
    data: call.data,
    gas: 400_000n,
  });
  return receipt.transactionHash;
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

export async function signCall(args: {
  wallet: WalletClient;
  publicClient: PublicClient;
  account: Account;
  to: Address;
  data: Hex;
  nonce?: number;
  fees?: FeeFields | null;
}): Promise<{ signed: Hex; nonce: number; fees: FeeFields | null }> {
  const { wallet, publicClient, account, to, data } = args;
  const [nonce, estimated] = await Promise.all([
    args.nonce !== undefined
      ? Promise.resolve(args.nonce)
      : publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
    args.fees ? Promise.resolve(null) : publicClient.estimateFeesPerGas().catch(() => null),
  ]);
  const fees: FeeFields | null = args.fees
    ?? (estimated?.maxFeePerGas !== undefined && estimated.maxPriorityFeePerGas !== undefined
      ? padFees({ maxFeePerGas: estimated.maxFeePerGas, maxPriorityFeePerGas: estimated.maxPriorityFeePerGas })
      : null);
  const signed = await wallet.signTransaction({
    account,
    chain: wallet.chain,
    to,
    data,
    nonce,
    gas: 400_000n,
    ...(fees ?? {}),
  });
  return { signed, nonce, fees };
}
