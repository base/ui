import type { Address, PublicClient } from 'viem';

import { B20_FACTORY, factoryAbi as b20FactoryAbi } from '../../b20/lib/protocol';
import { vibenetApi } from '../../../library/client';
import { factoryAbi, pairAbi } from './constants';
import type { Deployment } from './types';

/**
 * Deterministic v2 singleton addresses — CREATE2 via the Arachnid proxy
 * (0x4e59…4956C) with salt keccak256("vibenet.validity.<label>.v2"). Hardcoded
 * so the client doesn't bundle the deploy bytecode just to re-derive three
 * constants; the source that produces them lives in base/vibenet
 * (setup/contracts/src + the bytecode manifests). VIBE and the pair are
 * discovered from the factory (see probeSingleton) rather than hardcoded, since
 * VIBE's address depends on the deploying faucet account.
 */
export const VALIDITY_FACTORY = '0x8Ed0ec9883Fd0F48070f746DbA43B5A3cCA266B9' as Address;
export const VALIDITY_SWAP_HELPER = '0xBDcAA6883F472b16E8CdbC0f9382181263bBA78d' as Address;
export const VALIDITY_MINTER = '0x682Af40Abb62386559b7cAA2981b9cCc27Ca94d5' as Address;

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
  const predicted = {
    factory: VALIDITY_FACTORY,
    helper: VALIDITY_SWAP_HELPER,
    minter: VALIDITY_MINTER,
  };
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
