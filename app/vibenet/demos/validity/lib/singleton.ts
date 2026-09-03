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
import { vibenetApi } from '../../../library/client';
import {
  erc20Abi,
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
import { VIBE_NAME, VIBE_SYMBOL } from './quote';
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
  factory: singletonSalt('factory'),
  helper: singletonSalt('helper'),
} as const;

export type PredictedSingleton = Pick<Deployment, 'factory' | 'helper' | 'minter'>;

export function singletonInitCodes(): {
  minter: Hex;
  factory: Hex;
  helper: Hex;
} {
  return {
    minter: encodeDeployData({
      abi: minterAbi,
      bytecode: minterBytecode,
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

/** CREATE2 addresses for the Uni factory, helper, and VIBE minter. USDV is the faucet token. */
export function predictSingleton(): PredictedSingleton {
  const init = singletonInitCodes();
  return {
    minter: create2Address(SINGLETON_SALTS.minter, init.minter),
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
    // Vibenet mints a block every 200 ms (Denim); poll receipts at that cadence.
    pollingInterval: 150,
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

async function isB20Token(client: PublicClient, token: Address): Promise<boolean> {
  return client
    .readContract({
      address: B20_FACTORY,
      abi: b20FactoryAbi,
      functionName: 'isB20',
      args: [token],
    })
    .catch(() => false);
}

async function listPairs(
  client: PublicClient,
  factory: Address,
): Promise<{ pair: Address; token0: Address; token1: Address; reserve0: bigint; reserve1: bigint }[]> {
  const length = (await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'allPairsLength',
  })) as bigint;
  const rows = [];
  for (let i = 0n; i < length; i++) {
    const pair = (await client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: 'allPairs',
      args: [i],
    })) as Address;
    rows.push({ pair, ...(await pairTokens(client, pair)) });
  }
  return rows;
}

async function resolveVibenetUsdv(): Promise<Address> {
  const status = await vibenetApi.faucet.status();
  const address = status.usdv_address;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('Vibenet faucet did not return a USDV address.');
  }
  return address as Address;
}

function otherToken(
  token0: Address,
  token1: Address,
  known: Address,
): Address | null {
  const want = known.toLowerCase();
  if (token0.toLowerCase() === want) return token1;
  if (token1.toLowerCase() === want) return token0;
  return null;
}

/** Live shared pool against faucet USDV, or null if this chain still needs the first deploy. */
export async function probeSingleton(
  client: PublicClient,
  usdv?: Address,
): Promise<Deployment | null> {
  const tokenB = usdv ?? (await resolveVibenetUsdv());
  const predicted = predictSingleton();
  const [factory, helper, minter, usdvCode] = await Promise.all([
    hasCode(client, predicted.factory),
    hasCode(client, predicted.helper),
    hasCode(client, predicted.minter),
    hasCode(client, tokenB),
  ]);
  if (!factory || !helper || !minter || !usdvCode) return null;
  const hit = (await listPairs(client, predicted.factory)).find((row) => {
    if (row.reserve0 === 0n || row.reserve1 === 0n) return false;
    return otherToken(row.token0, row.token1, tokenB) !== null;
  });
  if (!hit) return null;
  const tokenA = otherToken(hit.token0, hit.token1, tokenB);
  if (!tokenA || !(await isB20Token(client, tokenA))) return null;
  return { ...predicted, tokenA, tokenB, token0: hit.token0, token1: hit.token1, pair: hit.pair };
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
  const tokenB = await resolveVibenetUsdv();
  const live = await probeSingleton(publicClient, tokenB);
  if (live) return live;

  const note = (label: string) => onProgress?.(label);
  await ensureCreate2Deployer(wallet, publicClient, account, onProgress);
  const init = singletonInitCodes();
  const predicted = predictSingleton();

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
    factory.toLowerCase() !== predicted.factory.toLowerCase() ||
    helper.toLowerCase() !== predicted.helper.toLowerCase() ||
    minter.toLowerCase() !== predicted.minter.toLowerCase()
  ) {
    throw new Error('CREATE2 address did not match the predicted singleton.');
  }

  const existing = await listPairs(publicClient, factory);
  const usdvPair = existing.find((row) => otherToken(row.token0, row.token1, tokenB));
  let pair = usdvPair?.pair ?? null;
  let tokenA = usdvPair ? otherToken(usdvPair.token0, usdvPair.token1, tokenB) : null;
  if (!tokenA) {
    for (const row of existing) {
      for (const candidate of [row.token0, row.token1]) {
        if (candidate.toLowerCase() === tokenB.toLowerCase()) continue;
        if (await isB20Token(publicClient, candidate)) {
          tokenA = candidate;
          break;
        }
      }
      if (tokenA) break;
    }
  }
  if (pair && tokenA) {
    // Official USDV pair already exists (maybe unseeded).
  } else if (tokenA) {
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
