import type { Abi, Address, Hex } from 'viem';

import erc20Artifact from './artifacts/MintableERC20.json';
import helperArtifact from './artifacts/SwapHelper.json';
import factoryArtifact from './artifacts/UniswapV2Factory.json';
import pairArtifact from './artifacts/UniswapV2Pair.json';

function with0x(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex;
}

export const erc20Abi = erc20Artifact.abi as Abi;
export const erc20Bytecode = with0x(erc20Artifact.bytecode);

export const factoryAbi = factoryArtifact.abi as Abi;
export const factoryBytecode = with0x(factoryArtifact.bytecode);

export const pairAbi = pairArtifact.abi as Abi;

export const helperAbi = helperArtifact.abi as Abi;
export const helperBytecode = with0x(helperArtifact.bytecode);

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export const RPC_PATH = '/api/vibenet/validity/rpc';
export const STATUS_PATH = '/api/vibenet/validity/status';

export const STORAGE_KEY = 'vibenet.validity.v3';
export const LEGACY_STORAGE_KEYS = ['vibenet.validity.v2', 'vibenet.validity.v1'] as const;

export const WAD = 10n ** 18n;
/** ~$0.07 USDV per VIBE so the tape has room to move, not a 1:1 peg. */
export const SEED_VIBE = 2_000_000n * WAD;
export const SEED_USDV = 140_000n * WAD;
export const TRADER_VIBE = 400_000n * WAD;
export const TRADER_USDV = 40_000n * WAD;
export const PAIR_RESERVES_SLOT = 8n;
export const RESERVE_BITS = 112n;
export const RESERVE0_MASK = (1n << RESERVE_BITS) - 1n;
export const RESERVE1_MASK = RESERVE0_MASK << RESERVE_BITS;

export const MAX_EXPIRY_SECONDS = 60;
/**
 * Canonical L2 block time. `block_number` predicates and mempool eviction
 * (`expire_by_block`) are on committed L2 blocks, not 250ms flashblocks.
 * Using 0.25s here made a 60s UI timer last ~8 minutes in the pool.
 */
export const BLOCK_SECONDS = 2;

/**
 * Finite box span around the target point on the current hyperbola.
 * Far edge is this multiple of the near edge (6%). The pair is 0% fee so k
 * does not walk off this patch while makers move price through the line.
 */
export const BOX_SPAN_NUM = 53n;
export const BOX_SPAN_DEN = 50n;
