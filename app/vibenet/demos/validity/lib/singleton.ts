import {
  concat,
  encodeDeployData,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  parseEther,
  toBytes,
  zeroAddress,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';

import {
  ACTIVATION_REGISTRY,
  activationAbi,
  B20_FACTORY,
  encodeDeploymentParams,
  encodeRoleGrant,
  factoryAbi as b20FactoryAbi,
  featureId,
} from '../../b20/lib/protocol';
import {
  erc20Abi,
  erc20Bytecode,
  factoryAbi,
  factoryBytecode,
  helperAbi,
  helperBytecode,
  minterAbi,
  minterBytecode,
  pairAbi,
  SEED_USDV,
  SEED_VIBE,
} from './constants';
import { USDV_NAME, USDV_SYMBOL, VIBE_NAME, VIBE_SYMBOL } from './quote';
import type { Deployment } from './types';

/**
 * Arachnid deterministic-deployment proxy. Already live on Vibenet; the
 * keyless tx is only broadcast when a fresh chain is missing it.
 * Address is CREATE(nickSigner, nonce=0).
 */
export const CREATE2_DEPLOYER = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as Address;
export const CREATE2_DEPLOYER_SIGNER = '0x3fab184622dc19b6109349b94811493bf2a45362' as Address;
export const CREATE2_DEPLOYER_FUND = parseEther('0.02');
export const CREATE2_DEPLOYER_TX =
  '0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222' as Hex;

/** Factory `feeToSetter` is fixed so the CREATE2 address does not depend on who deploys. */
export const FACTORY_FEE_TO_SETTER = zeroAddress;

export function singletonSalt(label: string): Hex {
  return keccak256(toBytes(`vibenet.validity.${label}.v1`));
}

export const SINGLETON_SALTS = {
  vibe: singletonSalt('vibe'),
  minter: singletonSalt('minter'),
  usdv: singletonSalt('usdv'),
  factory: singletonSalt('factory'),
  helper: singletonSalt('helper'),
} as const;

export type PredictedSingleton = Pick<Deployment, 'tokenB' | 'factory' | 'helper' | 'minter'>;

export function singletonInitCodes(): {
  minter: Hex;
  tokenB: Hex;
  factory: Hex;
  helper: Hex;
} {
  return {
    minter: encodeDeployData({
      abi: minterAbi,
      bytecode: minterBytecode,
    }),
    tokenB: encodeDeployData({
      abi: erc20Abi,
      bytecode: erc20Bytecode,
      args: [USDV_NAME, USDV_SYMBOL],
    }),
    factory: encodeDeployData({
      abi: factoryAbi,
      bytecode: factoryBytecode,
      args: [FACTORY_FEE_TO_SETTER],
    }),
    helper: encodeDeployData({
      abi: helperAbi,
      bytecode: helperBytecode,
    }),
  };
}

function create2Address(salt: Hex, initCode: Hex): Address {
  return getContractAddress({
    bytecode: initCode,
    from: CREATE2_DEPLOYER,
    opcode: 'CREATE2',
    salt,
  });
}

/** CREATE2 addresses for USDV, the Uni factory, helper, and VIBE minter. VIBE is a B20. */
export function predictSingleton(): PredictedSingleton {
  const init = singletonInitCodes();
  return {
    minter: create2Address(SINGLETON_SALTS.minter, init.minter),
    tokenB: create2Address(SINGLETON_SALTS.usdv, init.tokenB),
    factory: create2Address(SINGLETON_SALTS.factory, init.factory),
    helper: create2Address(SINGLETON_SALTS.helper, init.helper),
  };
}

export async function hasCode(client: PublicClient, address: Address): Promise<boolean> {
  const code = await client.getCode({ address }).catch(() => undefined);
  return Boolean(code && code !== '0x');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function wait(publicClient: PublicClient, hash: Hex): Promise<TransactionReceipt> {
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

async function waitForBytecode(
  publicClient: PublicClient,
  address: Address,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await hasCode(publicClient, address)) return;
    await sleep(400);
  }
  throw new Error(`${label} bytecode not visible on the read RPC yet (${address}).`);
}

/** Vibenet blocks are 6M gas; never ask the node for more than the current head allows. */
async function capGas(publicClient: PublicClient, requested: bigint): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  const max = block.gasLimit > 100_000n ? block.gasLimit - 100_000n : block.gasLimit;
  return requested < max ? requested : max;
}

async function send(
  wallet: WalletClient,
  publicClient: PublicClient,
  account: Account,
  request: { to?: Address; data: Hex; gas?: bigint; value?: bigint },
): Promise<TransactionReceipt> {
  const gas = request.gas !== undefined ? await capGas(publicClient, request.gas) : undefined;
  const hash = await wallet.sendTransaction({
    account,
    chain: wallet.chain,
    ...request,
    ...(gas !== undefined ? { gas } : {}),
  });
  return wait(publicClient, hash);
}

async function readPair(
  publicClient: PublicClient,
  factory: Address,
  tokenA: Address,
  tokenB: Address,
): Promise<Address | null> {
  const pair = (await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'getPair',
    args: [tokenA, tokenB],
  })) as Address;
  if (!pair || pair === zeroAddress) return null;
  return pair;
}

async function firstPair(client: PublicClient, factory: Address): Promise<Address | null> {
  const length = (await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'allPairsLength',
  })) as bigint;
  if (length === 0n) return null;
  return (await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'allPairs',
    args: [0n],
  })) as Address;
}

async function pairTokens(
  client: PublicClient,
  pair: Address,
): Promise<{ token0: Address; token1: Address; reserve0: bigint; reserve1: bigint }> {
  const [token0, token1, reserves] = await Promise.all([
    client.readContract({ address: pair, abi: pairAbi, functionName: 'token0' }) as Promise<Address>,
    client.readContract({ address: pair, abi: pairAbi, functionName: 'token1' }) as Promise<Address>,
    client.readContract({ address: pair, abi: pairAbi, functionName: 'getReserves' }) as Promise<
      [bigint, bigint, number]
    >,
  ]);
  return { token0, token1, reserve0: reserves[0], reserve1: reserves[1] };
}

/** Live shared pool, or null if this chain still needs the first deploy. */
export async function probeSingleton(client: PublicClient): Promise<Deployment | null> {
  const predicted = predictSingleton();
  const [usdv, factory, helper, minter] = await Promise.all([
    hasCode(client, predicted.tokenB),
    hasCode(client, predicted.factory),
    hasCode(client, predicted.helper),
    hasCode(client, predicted.minter),
  ]);
  if (!usdv || !factory || !helper || !minter) return null;
  const pair = await firstPair(client, predicted.factory);
  if (!pair) return null;
  const { token0, token1, reserve0, reserve1 } = await pairTokens(client, pair);
  if (reserve0 === 0n || reserve1 === 0n) return null;
  const usdvAddr = predicted.tokenB.toLowerCase();
  const tokenA = token0.toLowerCase() === usdvAddr ? token1 : token0;
  const isB20 = await client
    .readContract({
      address: B20_FACTORY,
      abi: b20FactoryAbi,
      functionName: 'isB20',
      args: [tokenA],
    })
    .catch(() => false);
  if (!isB20) return null;
  return { ...predicted, tokenA, token0, token1, pair };
}

export async function ensureCreate2Deployer(
  wallet: WalletClient,
  publicClient: PublicClient,
  account: Account,
  onProgress?: (label: string) => void,
): Promise<void> {
  if (await hasCode(publicClient, CREATE2_DEPLOYER)) return;
  onProgress?.('Publishing the CREATE2 deployer');
  const signerBal = await publicClient.getBalance({ address: CREATE2_DEPLOYER_SIGNER });
  if (signerBal < CREATE2_DEPLOYER_FUND) {
    await send(wallet, publicClient, account, {
      to: CREATE2_DEPLOYER_SIGNER,
      data: '0x',
      value: CREATE2_DEPLOYER_FUND - signerBal,
    });
  }
  const hash = (await publicClient.request({
    method: 'eth_sendRawTransaction',
    params: [CREATE2_DEPLOYER_TX],
  })) as Hex;
  await wait(publicClient, hash);
  await waitForBytecode(publicClient, CREATE2_DEPLOYER, 'CREATE2 deployer');
}

async function ensureCreate2Contract(
  wallet: WalletClient,
  publicClient: PublicClient,
  account: Account,
  salt: Hex,
  initCode: Hex,
  label: string,
  gas: bigint,
): Promise<Address> {
  const address = create2Address(salt, initCode);
  if (await hasCode(publicClient, address)) return address;
  await send(wallet, publicClient, account, {
    to: CREATE2_DEPLOYER,
    data: concat([salt, initCode]),
    gas,
  });
  await waitForBytecode(publicClient, address, label);
  return address;
}

async function seedPair(
  wallet: WalletClient,
  publicClient: PublicClient,
  account: Account,
  tokenA: Address,
  tokenB: Address,
  pair: Address,
  minter: Address,
): Promise<void> {
  const mintUsdV = (to: Address, amount: bigint) =>
    send(wallet, publicClient, account, {
      to: tokenB,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'mint',
        args: [to, amount],
      }),
    });
  await send(wallet, publicClient, account, {
    to: minter,
    data: encodeFunctionData({
      abi: minterAbi,
      functionName: 'mint',
      args: [tokenA, account.address, SEED_VIBE],
    }),
  });
  await mintUsdV(account.address, SEED_USDV);
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
}

/**
 * Deploy any missing singleton pieces and seed the pair once.
 * Later callers no-op once `probeSingleton` would succeed.
 */
export async function ensureSingleton(args: {
  wallet: WalletClient;
  publicClient: PublicClient;
  account: Account;
  onProgress?: (label: string) => void;
}): Promise<Deployment> {
  const { wallet, publicClient, account, onProgress } = args;
  const live = await probeSingleton(publicClient);
  if (live) return live;

  const note = (label: string) => onProgress?.(label);
  await ensureCreate2Deployer(wallet, publicClient, account, onProgress);
  const init = singletonInitCodes();
  const predicted = predictSingleton();

  note('Deploying shared USDV');
  const tokenB = await ensureCreate2Contract(
    wallet,
    publicClient,
    account,
    SINGLETON_SALTS.usdv,
    init.tokenB,
    'USDV',
    2_000_000n,
  );
  note('Deploying shared Uniswap V2 factory');
  const factory = await ensureCreate2Contract(
    wallet,
    publicClient,
    account,
    SINGLETON_SALTS.factory,
    init.factory,
    'Factory',
    5_800_000n,
  );
  note('Deploying shared swap helper');
  const helper = await ensureCreate2Contract(
    wallet,
    publicClient,
    account,
    SINGLETON_SALTS.helper,
    init.helper,
    'Swap helper',
    1_000_000n,
  );
  note('Deploying VIBE minter');
  const minter = await ensureCreate2Contract(
    wallet,
    publicClient,
    account,
    SINGLETON_SALTS.minter,
    init.minter,
    'VIBE minter',
    1_000_000n,
  );
  if (
    tokenB.toLowerCase() !== predicted.tokenB.toLowerCase() ||
    factory.toLowerCase() !== predicted.factory.toLowerCase() ||
    helper.toLowerCase() !== predicted.helper.toLowerCase() ||
    minter.toLowerCase() !== predicted.minter.toLowerCase()
  ) {
    throw new Error('CREATE2 address did not match the predicted singleton.');
  }

  let pair = await firstPair(publicClient, factory);
  let tokenA: Address | null = null;
  if (pair) {
    const tokens = await pairTokens(publicClient, pair);
    tokenA = tokens.token0.toLowerCase() === tokenB.toLowerCase() ? tokens.token1 : tokens.token0;
  } else {
    const active = await publicClient.readContract({
      address: ACTIVATION_REGISTRY,
      abi: activationAbi,
      functionName: 'isActivated',
      args: [featureId('asset')],
    });
    if (!active) throw new Error('Creating B20 asset tokens is not available on this network right now.');
    note('Creating shared VIBE (B20)');
    const params = encodeDeploymentParams('asset', VIBE_NAME, VIBE_SYMBOL, account.address, 18, '');
    tokenA = (await publicClient.readContract({
      address: B20_FACTORY,
      abi: b20FactoryAbi,
      functionName: 'getB20Address',
      args: [0, account.address, SINGLETON_SALTS.vibe],
    })) as Address;
    await send(wallet, publicClient, account, {
      to: B20_FACTORY,
      data: encodeFunctionData({
        abi: b20FactoryAbi,
        functionName: 'createB20',
        args: [0, SINGLETON_SALTS.vibe, params, []],
      }),
      gas: 4_000_000n,
    });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const ready = await publicClient
        .readContract({
          address: B20_FACTORY,
          abi: b20FactoryAbi,
          functionName: 'isB20Initialized',
          args: [tokenA],
        })
        .catch(() => false);
      if (ready) break;
      await sleep(400);
    }
    await send(wallet, publicClient, account, {
      to: tokenA,
      data: encodeRoleGrant('MINT_ROLE', minter),
    });
    note('Creating the shared pair');
    await send(wallet, publicClient, account, {
      to: factory,
      data: encodeFunctionData({
        abi: factoryAbi,
        functionName: 'createPair',
        args: [tokenA, tokenB],
      }),
      gas: 5_000_000n,
    });
    const pairDeadline = Date.now() + 60_000;
    while (!pair && Date.now() < pairDeadline) {
      pair = await readPair(publicClient, factory, tokenA, tokenB);
      if (!pair) await sleep(400);
    }
    if (!pair) throw new Error('Factory returned no pair.');
  }
  if (!tokenA) throw new Error('Could not resolve the shared VIBE token.');
  await waitForBytecode(publicClient, pair, 'Pair');

  const { token0, token1, reserve0, reserve1 } = await pairTokens(publicClient, pair);
  if (reserve0 === 0n || reserve1 === 0n) {
    note('Seeding VIBE/USDV (~$0.07)');
    await seedPair(wallet, publicClient, account, tokenA, tokenB, pair, minter);
  }

  return { tokenA, tokenB, token0, token1, factory, pair, helper, minter };
}
