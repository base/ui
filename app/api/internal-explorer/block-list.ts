// Cursor-paginated block listing straight from the execution RPC. Chain-aware:
// the caller passes the resolved rpcUrl (getRpcUrl(chain)). Numeric cursor =
// block number. Server-only.
import { decimalQuantity, hexToNumber, rpcCall, toBlockTag } from './rpc';

export const HOME_BLOCK_LIMIT = 10;
export const DEFAULT_BLOCKS_PAGE_LIMIT = 25;
export const MAX_BLOCKS_PAGE_LIMIT = 100;

export interface BlockSummary {
  hash: string;
  number: number;
  timestamp: number;
  /** Unix milliseconds from Denim's `timestampMs`; null on blocks or nodes without it. */
  timestampMs: number | null;
  /** Null when unknown, such as a streamed head whose count lookup failed. */
  transactionCount: number | null;
  gasUsed: string | null;
  gasLimit: string | null;
  baseFeePerGas: string | null;
}

export interface BlocksPage {
  cursor: number | null;
  limit: number;
  latestBlockNumber: number;
  nextCursor: number | null;
  hasMore: boolean;
}

export interface BlocksResponse {
  blocks: BlockSummary[];
  page: BlocksPage;
}

export interface BlockListQuery {
  cursor: number | null;
  limit: number;
}

export class InvalidBlockListQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBlockListQueryError';
  }
}

export class BlockListUnavailableError extends Error {
  constructor(message = 'block list unavailable') {
    super(message);
    this.name = 'BlockListUnavailableError';
  }
}

function parseNonNegativeInteger(value: string | null, name: string): number | null {
  if (value === null) return null;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new InvalidBlockListQueryError(`${name} must be a non-negative integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidBlockListQueryError(`${name} is too large`);
  }
  return parsed;
}

export function parseBlockListQuery(searchParams: URLSearchParams): BlockListQuery {
  const cursor = parseNonNegativeInteger(searchParams.get('cursor'), 'cursor');
  const rawLimit = searchParams.get('limit');
  const limit = rawLimit === null ? HOME_BLOCK_LIMIT : parseNonNegativeInteger(rawLimit, 'limit');

  if (limit === null || limit < 1 || limit > MAX_BLOCKS_PAGE_LIMIT) {
    throw new InvalidBlockListQueryError(`limit must be between 1 and ${MAX_BLOCKS_PAGE_LIMIT}`);
  }

  return { cursor, limit };
}

export function blockNumbersForPage(
  latestBlockNumber: number,
  cursor: number | null,
  limit: number,
): number[] {
  const start = Math.min(cursor ?? latestBlockNumber, latestBlockNumber);
  return Array.from({ length: limit }, (_, index) => start - index).filter(
    (number) => number >= 0,
  );
}

export function nextBlockCursor(blocks: Pick<BlockSummary, 'number'>[]): number | null {
  const oldest = blocks.at(-1)?.number;
  return oldest === undefined || oldest === 0 ? null : oldest - 1;
}

async function fetchLatestBlockNumber(rpcUrl: string): Promise<number | null> {
  const result = await rpcCall(rpcUrl, 'eth_blockNumber', []);
  return hexToNumber(result);
}

/**
 * Map a raw `eth_getBlockBy*` result (hashes only) or a newHeads header to a
 * summary, or null if malformed. Headers carry no transaction list, so their
 * `transactionCount` is null.
 */
export function parseBlockSummary(result: unknown): BlockSummary | null {
  if (!result || typeof result !== 'object') return null;
  const block = result as Record<string, unknown>;
  const number = hexToNumber(block.number);
  const timestamp = hexToNumber(block.timestamp);
  if (block.hash === undefined || number === null || timestamp === null) {
    return null;
  }

  return {
    hash: String(block.hash),
    number,
    timestamp,
    timestampMs: hexToNumber(block.timestampMs),
    transactionCount: Array.isArray(block.transactions) ? block.transactions.length : null,
    gasUsed: decimalQuantity(block.gasUsed),
    gasLimit: decimalQuantity(block.gasLimit),
    baseFeePerGas: decimalQuantity(block.baseFeePerGas),
  };
}

export async function fetchTransactionCountByHash(
  rpcUrl: string,
  hash: string,
): Promise<number | null> {
  return hexToNumber(await rpcCall(rpcUrl, 'eth_getBlockTransactionCountByHash', [hash]));
}

async function fetchBlockByNumber(
  rpcUrl: string,
  blockNumber: number,
): Promise<BlockSummary | null> {
  return parseBlockSummary(
    await rpcCall(rpcUrl, 'eth_getBlockByNumber', [toBlockTag(blockNumber), false]),
  );
}

export async function fetchBlocksByNumbers(
  rpcUrl: string,
  numbers: number[],
): Promise<BlockSummary[]> {
  const blocks = await Promise.all(
    numbers.map((blockNumber) => fetchBlockByNumber(rpcUrl, blockNumber)),
  );

  if (blocks.some((block) => block === null)) {
    throw new BlockListUnavailableError('failed to fetch one or more blocks');
  }

  return blocks as BlockSummary[];
}

export async function listBlocks(rpcUrl: string, query: BlockListQuery): Promise<BlocksResponse> {
  const latestBlockNumber = await fetchLatestBlockNumber(rpcUrl);
  if (latestBlockNumber === null) {
    throw new BlockListUnavailableError('failed to fetch latest block');
  }

  const blockNumbers = blockNumbersForPage(latestBlockNumber, query.cursor, query.limit);
  const blocks = await Promise.all(
    blockNumbers.map((blockNumber) => fetchBlockByNumber(rpcUrl, blockNumber)),
  );

  if (blocks.some((block) => block === null)) {
    throw new BlockListUnavailableError('failed to fetch one or more blocks');
  }

  const validBlocks = blocks as BlockSummary[];
  const nextCursor = nextBlockCursor(validBlocks);

  return {
    blocks: validBlocks,
    page: {
      cursor: query.cursor,
      limit: query.limit,
      latestBlockNumber,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  };
}
