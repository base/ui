// Cursor-paginated confirmed-transaction listing from the execution RPC. Ported
// from tips-ui src/lib/transaction-list.ts, but viem-free (raw JSON-RPC via rpc.ts)
// and chain-aware: the caller passes the resolved rpcUrl (getRpcUrl(chain)). Walks
// blocks newest→oldest, enriches with batched receipts for fees. Cursor format is
// blockNumber:transactionIndex. Server-only.
import { calculateTransactionFee } from '../../tips/library/explorer-format';
import { getTransactionReceiptSummaries, type ReceiptSummary } from './receipts';
import { hexToBigInt, rpcCall, toBlockTag } from './rpc';

export const DEFAULT_TRANSACTION_PAGE_LIMIT = 50;
export const MAX_TRANSACTION_PAGE_LIMIT = 100;

export interface TransactionPosition {
  blockNumber: number;
  transactionIndex: number;
}

export interface TransactionListItem {
  hash: string;
  blockHash: string;
  blockNumber: number;
  transactionIndex: number;
  blockTimestamp: number;
  from: string;
  to: string | null;
  input: string;
  value: string;
  gasLimit: string;
  gasUsed: string | null;
  effectiveGasPrice: string | null;
  transactionFee: string | null;
  bundleId: string | null;
  metering: {
    transaction: unknown;
    bundle: unknown;
  } | null;
}

export interface TransactionsResponse {
  transactions: TransactionListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  latestBlockNumber: number;
}

export interface TransactionListQuery {
  cursor: TransactionPosition | null;
  limit: number;
}

export class InvalidTransactionListQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransactionListQueryError';
  }
}

export class TransactionListUnavailableError extends Error {
  constructor(message = 'transaction list unavailable') {
    super(message);
    this.name = 'TransactionListUnavailableError';
  }
}

interface ParsedListTransaction {
  hash: string;
  from: string;
  to: string | null;
  input: string;
  value: bigint;
  gas: bigint;
}

interface ParsedListBlock {
  hash: string;
  number: bigint;
  timestamp: bigint;
  transactions: ParsedListTransaction[];
}

function parseNonNegativeInteger(value: string, name: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new InvalidTransactionListQueryError(`${name} must be a non-negative integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidTransactionListQueryError(`${name} is too large`);
  }
  return parsed;
}

export function formatTransactionCursor(position: TransactionPosition): string {
  return `${position.blockNumber}:${position.transactionIndex}`;
}

export function parseTransactionCursor(value: string | null): TransactionPosition | null {
  if (value === null) return null;
  const parts = value.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new InvalidTransactionListQueryError(
      'cursor must be formatted as blockNumber:transactionIndex',
    );
  }

  return {
    blockNumber: parseNonNegativeInteger(parts[0], 'cursor block number'),
    transactionIndex: parseNonNegativeInteger(parts[1], 'cursor transaction index'),
  };
}

export function parseTransactionListQuery(searchParams: URLSearchParams): TransactionListQuery {
  const rawLimit = searchParams.get('limit');
  const limit =
    rawLimit === null ? DEFAULT_TRANSACTION_PAGE_LIMIT : parseNonNegativeInteger(rawLimit, 'limit');
  if (limit < 1 || limit > MAX_TRANSACTION_PAGE_LIMIT) {
    throw new InvalidTransactionListQueryError(
      `limit must be between 1 and ${MAX_TRANSACTION_PAGE_LIMIT}`,
    );
  }

  return {
    cursor: parseTransactionCursor(searchParams.get('cursor')),
    limit,
  };
}

async function fetchLatestBlockNumber(rpcUrl: string): Promise<bigint | null> {
  const result = await rpcCall(rpcUrl, 'eth_blockNumber', []);
  return hexToBigInt(result);
}

function parseListTransaction(value: unknown): ParsedListTransaction | null {
  if (!value || typeof value !== 'object') return null;
  const tx = value as Record<string, unknown>;
  if (typeof tx.hash !== 'string' || typeof tx.from !== 'string') return null;
  return {
    hash: tx.hash,
    from: tx.from,
    to: typeof tx.to === 'string' ? tx.to : null,
    input: typeof tx.input === 'string' ? tx.input : '0x',
    value: hexToBigInt(tx.value) ?? 0n,
    gas: hexToBigInt(tx.gas) ?? 0n,
  };
}

async function fetchBlockWithTransactions(
  rpcUrl: string,
  blockNumber: bigint,
): Promise<ParsedListBlock | null> {
  const result = await rpcCall(rpcUrl, 'eth_getBlockByNumber', [toBlockTag(blockNumber), true]);
  if (!result || typeof result !== 'object') return null;
  const block = result as Record<string, unknown>;
  const number = hexToBigInt(block.number);
  const timestamp = hexToBigInt(block.timestamp);
  if (typeof block.hash !== 'string' || number === null || timestamp === null) {
    return null;
  }

  const transactions = Array.isArray(block.transactions)
    ? block.transactions.map(parseListTransaction)
    : [];

  return {
    hash: block.hash,
    number,
    timestamp,
    transactions: transactions.filter((tx): tx is ParsedListTransaction => tx !== null),
  };
}

function serializeTransaction(
  block: ParsedListBlock,
  transaction: ParsedListTransaction,
  transactionIndex: number,
  receipt: ReceiptSummary | null,
): TransactionListItem {
  const effectiveGasPrice = receipt?.effectiveGasPrice ?? null;
  const transactionFee = calculateTransactionFee(receipt?.gasUsed, effectiveGasPrice);

  return {
    hash: transaction.hash,
    blockHash: block.hash,
    blockNumber: Number(block.number),
    transactionIndex,
    blockTimestamp: Number(block.timestamp),
    from: transaction.from,
    to: transaction.to,
    input: transaction.input,
    value: transaction.value.toString(),
    gasLimit: transaction.gas.toString(),
    gasUsed: receipt?.gasUsed.toString() ?? null,
    effectiveGasPrice: effectiveGasPrice?.toString() ?? null,
    transactionFee: transactionFee?.toString() ?? null,
    bundleId: null,
    metering: null,
  };
}

export async function listTransactions(
  rpcUrl: string,
  query: TransactionListQuery,
): Promise<TransactionsResponse> {
  const latestBlockNumber = await fetchLatestBlockNumber(rpcUrl);
  if (latestBlockNumber === null) {
    throw new TransactionListUnavailableError('failed to fetch latest block');
  }

  const latestBlockNumberAsNumber = Number(latestBlockNumber);
  if (!Number.isSafeInteger(latestBlockNumberAsNumber)) {
    throw new TransactionListUnavailableError('latest block is too large');
  }

  let currentBlockNumber = BigInt(
    Math.min(query.cursor?.blockNumber ?? latestBlockNumberAsNumber, latestBlockNumberAsNumber),
  );
  let maxTransactionIndex = query.cursor
    ? query.cursor.transactionIndex - 1
    : Number.POSITIVE_INFINITY;
  const rawTransactions: Array<{
    block: ParsedListBlock;
    transaction: ParsedListTransaction;
    transactionIndex: number;
  }> = [];

  while (rawTransactions.length < query.limit && currentBlockNumber >= 0n) {
    const block = await fetchBlockWithTransactions(rpcUrl, currentBlockNumber);
    if (block === null) {
      throw new TransactionListUnavailableError(
        `failed to fetch block ${currentBlockNumber.toString()}`,
      );
    }

    const transactions = block.transactions;
    const startIndex = Math.min(maxTransactionIndex, transactions.length - 1);
    for (
      let transactionIndex = startIndex;
      transactionIndex >= 0 && rawTransactions.length < query.limit;
      transactionIndex -= 1
    ) {
      const transaction = transactions[transactionIndex];
      if (!transaction) continue;
      rawTransactions.push({ block, transaction, transactionIndex });
    }

    currentBlockNumber -= 1n;
    maxTransactionIndex = Number.POSITIVE_INFINITY;
  }

  const receiptByHash = await getTransactionReceiptSummaries(
    rpcUrl,
    rawTransactions.map(({ transaction }) => transaction.hash),
  );
  const transactions = rawTransactions.map(({ block, transaction, transactionIndex }) => {
    const receipt = receiptByHash.get(transaction.hash) ?? null;
    return serializeTransaction(block, transaction, transactionIndex, receipt);
  });
  const hasMore = transactions.length === query.limit && currentBlockNumber >= 0n;

  return {
    transactions,
    nextCursor:
      hasMore && transactions.length > 0
        ? formatTransactionCursor({
            blockNumber: transactions.at(-1)?.blockNumber ?? 0,
            transactionIndex: transactions.at(-1)?.transactionIndex ?? 0,
          })
        : null,
    hasMore,
    latestBlockNumber: latestBlockNumberAsNumber,
  };
}
