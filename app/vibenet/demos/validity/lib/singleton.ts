import {
  encodeDeployData,
  getContractAddress,
  keccak256,
  toBytes,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

import { B20_FACTORY, factoryAbi as b20FactoryAbi } from '../../b20/lib/protocol';
import { vibenetApi } from '../../../library/client';
import {
  factoryAbi,
  factoryBytecode,
  helperAbi,
  helperBytecode,
  minterAbi,
  minterBytecode,
  pairAbi,
} from './constants';
import type { Deployment } from './types';

/**
 * Arachnid deterministic-deployment proxy. Already live on Vibenet; used here
 * only to re-derive the shared singleton CREATE2 addresses so the demo can
 * discover the pool the central actor system deployed. Address is
 * CREATE(nickSigner, nonce=0).
 */
export const CREATE2_DEPLOYER = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as Address;

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

/**
 * Live shared pool against faucet USDV, or null if the central actor system
 * has not deployed + seeded it yet. Read-only: the demo never deploys — the
 * fixtures are created by vibenet-setup and driven by the actor system.
 */
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
