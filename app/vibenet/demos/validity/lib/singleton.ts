import { getContractAddress, keccak256, toBytes, type Address, type Hex, type PublicClient } from 'viem';

import { B20_FACTORY, factoryAbi as b20FactoryAbi } from '../../b20/lib/protocol';
import { factoryAbi, pairAbi } from './constants';
import type { Deployment } from './types';

/**
 * Arachnid deterministic-deployment proxy. Already live on Vibenet; used here
 * to derive CREATE2 addresses for contracts (like the conditional withdrawal
 * demo) that the client itself deploys. Address is CREATE(nickSigner, nonce=0).
 */
export const CREATE2_DEPLOYER = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as Address;

export function singletonSalt(label: string): Hex {
  return keccak256(toBytes(`vibenet.validity.${label}.v1`));
}

export function create2Address(salt: Hex, initCode: Hex): Address {
  return getContractAddress({
    bytecode: initCode,
    from: CREATE2_DEPLOYER,
    opcode: 'CREATE2',
    salt,
  });
}

/**
 * Deterministic v3 singleton addresses for the Uni factory, swap helper, and
 * VIBE minter — CREATE2 via the deployer above with salt
 * keccak256("vibenet.validity.<label>.v3"). Hardcoded so the client doesn't
 * bundle the deploy bytecode just to re-derive three constants; the source
 * that produces them lives in base/vibenet (setup/contracts/src/SwapHelper.sol
 * + the bytecode manifests). VIBE and the pair are discovered from the
 * factory (see probeSingleton), not hardcoded, since VIBE's address depends
 * on the deploying faucet account.
 */
export const VALIDITY_FACTORY = '0xFC076BC5DD2EE015508a257d5318927b8E21eE13' as Address;
export const VALIDITY_SWAP_HELPER = '0x6F5A2e185d58fec58a55D8BE1A9EA9A361899d55' as Address;
export const VALIDITY_MINTER = '0x09789310F6Db41c2d9a045641c97aC91e4209335' as Address;

export async function hasCode(client: PublicClient, address: Address): Promise<boolean> {
  const code = await client.getCode({ address }).catch(() => undefined);
  return Boolean(code && code !== '0x');
}

type PairRow = {
  pair: Address;
  token0: Address;
  token1: Address;
  reserve0: bigint;
  reserve1: bigint;
  lastTradeAt: number;
};

async function pairTokens(client: PublicClient, pair: Address): Promise<Omit<PairRow, 'pair'>> {
  const [token0, token1, reserves] = await Promise.all([
    client.readContract({ address: pair, abi: pairAbi, functionName: 'token0' }) as Promise<Address>,
    client.readContract({ address: pair, abi: pairAbi, functionName: 'token1' }) as Promise<Address>,
    client.readContract({ address: pair, abi: pairAbi, functionName: 'getReserves' }) as Promise<
      [bigint, bigint, number]
    >,
  ]);
  return { token0, token1, reserve0: reserves[0], reserve1: reserves[1], lastTradeAt: reserves[2] };
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

async function listPairs(client: PublicClient, factory: Address): Promise<PairRow[]> {
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

/** A redeployed setup can leave several seeded VIBE/USDV pools; only the one the actors trade moves. */
export function pickLivePair<T extends { reserve0: bigint; reserve1: bigint; lastTradeAt: number }>(
  rows: readonly T[],
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.reserve0 === 0n || row.reserve1 === 0n) continue;
    if (!best || row.lastTradeAt > best.lastTradeAt) best = row;
  }
  return best;
}

/**
 * Live shared VIBE pool, or null if the central actor system has not deployed
 * + seeded it yet. Read-only: the demo never deploys — the fixtures are
 * created by vibenet-setup and driven by the actor system.
 */
export async function probeSingleton(client: PublicClient): Promise<Deployment | null> {
  const predicted = {
    factory: VALIDITY_FACTORY,
    helper: VALIDITY_SWAP_HELPER,
    minter: VALIDITY_MINTER,
  };
  const [factory, helper, minter] = await Promise.all([
    hasCode(client, predicted.factory),
    hasCode(client, predicted.helper),
    hasCode(client, predicted.minter),
  ]);
  if (!factory || !helper || !minter) return null;
  const rows = await listPairs(client, predicted.factory);
  const vibePairs = [];
  for (const row of rows) {
    const [b20First, b20Second] = await Promise.all([isB20Token(client, row.token0), isB20Token(client, row.token1)]);
    if (b20First === b20Second) continue;
    vibePairs.push({ ...row, tokenA: b20First ? row.token0 : row.token1, tokenB: b20First ? row.token1 : row.token0 });
  }
  const hit = pickLivePair(vibePairs);
  if (!hit) return null;
  return { ...predicted, tokenA: hit.tokenA, tokenB: hit.tokenB, token0: hit.token0, token1: hit.token1, pair: hit.pair };
}
