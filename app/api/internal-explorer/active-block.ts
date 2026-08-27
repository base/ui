// Find the latest block that includes at least one non-system transaction.
// Every Base block starts with the L1 attributes deposit from the system
// sender; Zeronet often has long stretches of those-only blocks.
// Server-only: walks eth_getBlockByNumber from head.
import { BlockListUnavailableError, InvalidBlockListQueryError } from './block-list';
import { hexToNumber, rpcBatch, rpcCall, toBlockTag } from './rpc';

export const SYSTEM_SENDER_ADDRESS = '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0001';

export const DEFAULT_ACTIVE_BLOCK_BATCH_SIZE = 80;
export const DEFAULT_ACTIVE_BLOCK_MAX_BLOCKS = 8_000;

export type LatestActiveBlockResponse = {
  hash: string;
  number: number;
};

export type ActiveBlockQuery = {
  // Exclusive upper bound: scan blocks strictly older than this number.
  // Null means start from chain head.
  before: number | null;
};

export function parseActiveBlockQuery(searchParams: URLSearchParams): ActiveBlockQuery {
  const raw = searchParams.get('before');
  if (raw === null) return { before: null };
  if (!/^(0|[1-9]\d*)$/.test(raw)) {
    throw new InvalidBlockListQueryError('before must be a non-negative integer');
  }
  const before = Number(raw);
  if (!Number.isSafeInteger(before)) {
    throw new InvalidBlockListQueryError('before is too large');
  }
  return { before };
}

export type HashOnlyBlock = {
  hash: string;
  number: number;
  transactionCount: number;
};

export type BlockTransactionSender = {
  from: string | null;
};

export function isSystemSender(from: string | null | undefined): boolean {
  return (from ?? '').toLowerCase() === SYSTEM_SENDER_ADDRESS;
}

export function hasNonSystemTransaction(transactions: readonly BlockTransactionSender[]): boolean {
  return transactions.some((tx) => !isSystemSender(tx.from));
}

export type ActiveBlockLookup = {
  latestBlockNumber: number;
  loadHashBlocks: (numbers: number[]) => Promise<Array<HashOnlyBlock | null>>;
  loadSenders: (blockNumber: number) => Promise<BlockTransactionSender[] | null>;
  batchSize?: number;
  maxBlocks?: number;
};

function descendingRange(start: number, count: number): number[] {
  const length = Math.max(0, Math.min(count, start + 1));
  return Array.from({ length }, (_, index) => start - index);
}

// Every Base block includes the L1 attributes deposit, so a single-tx block is
// treated as system-only. Candidates are blocks with more than one transaction,
// then confirmed by sender so two system txs cannot pass as "active".
export async function findLatestActiveBlock(
  lookup: ActiveBlockLookup,
): Promise<LatestActiveBlockResponse | null> {
  const batchSize = lookup.batchSize ?? DEFAULT_ACTIVE_BLOCK_BATCH_SIZE;
  const maxBlocks = lookup.maxBlocks ?? DEFAULT_ACTIVE_BLOCK_MAX_BLOCKS;
  const floor = Math.max(0, lookup.latestBlockNumber - maxBlocks + 1);
  let cursor = lookup.latestBlockNumber;

  while (cursor >= floor) {
    const numbers = descendingRange(cursor, Math.min(batchSize, cursor - floor + 1));
    if (numbers.length === 0) break;

    const blocks = await lookup.loadHashBlocks(numbers);
    const byNumber = new Map<number, HashOnlyBlock>();
    for (const block of blocks) {
      if (block) byNumber.set(block.number, block);
    }

    for (const number of numbers) {
      const block = byNumber.get(number);
      if (!block || block.transactionCount <= 1) continue;

      const senders = await lookup.loadSenders(block.number);
      if (senders && hasNonSystemTransaction(senders)) {
        return { hash: block.hash, number: block.number };
      }
    }

    cursor = numbers[numbers.length - 1] - 1;
  }

  return null;
}

function parseHashOnlyBlock(value: unknown): HashOnlyBlock | null {
  if (!value || typeof value !== 'object') return null;
  const block = value as Record<string, unknown>;
  const number = hexToNumber(block.number);
  if (typeof block.hash !== 'string' || number === null) return null;
  return {
    hash: block.hash,
    number,
    transactionCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
  };
}

function parseSenders(value: unknown): BlockTransactionSender[] | null {
  if (!value || typeof value !== 'object') return null;
  const block = value as Record<string, unknown>;
  if (!Array.isArray(block.transactions)) return null;
  return block.transactions.map((tx) => {
    if (!tx || typeof tx !== 'object') return { from: null };
    const from = (tx as Record<string, unknown>).from;
    return { from: typeof from === 'string' ? from : null };
  });
}

export async function findLatestActiveBlockFromRpc(
  rpcUrl: string,
  startBlockNumber?: number,
): Promise<LatestActiveBlockResponse | null> {
  const head = hexToNumber(await rpcCall(rpcUrl, 'eth_blockNumber', []));
  if (head === null) {
    throw new BlockListUnavailableError('failed to fetch latest block');
  }

  const latestBlockNumber =
    startBlockNumber === undefined ? head : Math.min(startBlockNumber, head);
  if (latestBlockNumber < 0) return null;

  return findLatestActiveBlock({
    latestBlockNumber,
    loadHashBlocks: async (numbers) => {
      const responses = await rpcBatch(
        rpcUrl,
        numbers.map((number) => ({
          method: 'eth_getBlockByNumber',
          params: [toBlockTag(number), false],
        })),
      );
      if (responses.length === 0) {
        throw new BlockListUnavailableError('failed to fetch blocks');
      }
      const byId = new Map(responses.map((entry) => [entry.id, entry]));
      return numbers.map((_, index) => parseHashOnlyBlock(byId.get(index + 1)?.result));
    },
    loadSenders: async (blockNumber) =>
      parseSenders(await rpcCall(rpcUrl, 'eth_getBlockByNumber', [toBlockTag(blockNumber), true])),
  });
}
