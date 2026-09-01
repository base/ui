import { parseAbi, type Abi, type Hex } from 'viem';

import helperArtifact from './artifacts/SwapHelper.json';
import factoryArtifact from './artifacts/UniswapV2Factory.json';
import minterArtifact from './artifacts/ValidityOpenMinter.json';

function with0x(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex;
}

export const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'function mint(address,uint256)',
]);

export const factoryAbi = factoryArtifact.abi as Abi;
export const factoryBytecode = with0x(factoryArtifact.bytecode);

export const pairAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function mint(address to) returns (uint256 liquidity)',
  'function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes data)',
]);

export const helperAbi = helperArtifact.abi as Abi;
export const helperBytecode = with0x(helperArtifact.bytecode);

export const minterAbi = minterArtifact.abi as Abi;
export const minterBytecode = with0x(minterArtifact.bytecode);

export const CANDLES_PATH = '/api/vibenet/validity/candles';

export const STORAGE_KEY = 'vibenet.validity.v6';

export const WAD = 10n ** 18n;
export const USDV_DECIMALS = 6;
export const VIBE_DECIMALS = 18;
export const USDV_UNIT = 10n ** BigInt(USDV_DECIMALS);
/** humanQuoteWad = usdv_raw * QUOTE_SCALE / vibe_raw */
export const QUOTE_SCALE = 10n ** BigInt(18 - USDV_DECIMALS + VIBE_DECIMALS);
/** ~$0.07 USDV per VIBE so the tape has room to move, not a 1:1 peg. */
export const SEED_VIBE = 2_000_000n * WAD;
export const SEED_USDV = 140_000n * USDV_UNIT;
export const TRADER_VIBE = 400_000n * WAD;
export const TRADER_USDV = 40_000n * USDV_UNIT;
/** Fixed ticket size. 100 VIBE is ~$7 at the $0.07 mid — readable, not a pool-mover. */
export const TRADE_VIBE = 100n * WAD;
export const PAIR_RESERVES_SLOT = 8n;
export const RESERVE_BITS = 112n;
export const RESERVE0_MASK = (1n << RESERVE_BITS) - 1n;
export const RESERVE1_MASK = RESERVE0_MASK << RESERVE_BITS;

export const MAX_EXPIRY_SECONDS = 60;
export { MAX_NONCELESS_SECONDS } from '../../../library/aa';
/**
 * Denim-native L2 block time. `block_number` predicates and mempool eviction
 * are on committed 200ms blocks, not 2s pre-Denim heads or 250ms flashblocks.
 */
export const BLOCK_SECONDS = 0.2;
/** Stamp the mid on each 200ms head so the live 5s candle can wick. */
export const CANDLE_SAMPLE_MS = 200;
export const CANDLE_BUCKET_MS = 5_000;
export const CANDLE_WINDOW_MS = 180_000;

/**
 * Finite box span around the target point on the current hyperbola.
 * Far edge is this multiple of the near edge (6%). The pair is 0% fee so k
 * does not walk off this patch while makers move price through the line.
 */
export const BOX_SPAN_NUM = 53n;
export const BOX_SPAN_DEN = 50n;
