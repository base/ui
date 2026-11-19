// On-chain ERC-20 reads for the explorer. Receipts and the address index don't
// carry a token's name, supply, or transfer parties, so the address page reads
// the contract itself and decodes its Transfer logs.

import { createPublicClient, http, parseAbiItem, type Address as ViemAddress, type Hex } from 'viem';

import type { ExplorerTxResponse } from './api-types';
import { vibenetApi } from './client';
import { VIBENET_RPC_URL } from './config';
import { decodeErc20TransferLog } from './explorer';
import { isAddress } from './format';

const ERC20_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

// A short wait lets the parallel reads and receipt lookups below leave as one
// JSON-RPC batch instead of a request per call.
const client = createPublicClient({
  transport: http(VIBENET_RPC_URL, { batch: { wait: 16 }, retryCount: 1 }),
});

export type TokenMeta = { symbol: string; decimals: number };

export type Erc20Profile = {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
};

export type TokenTransfer = {
  txHash: string;
  blockNumber: number;
  logIndex: number;
  from: string;
  to: string;
  amount: bigint;
};

export type RawTransferLog = {
  address: string;
  topics: readonly string[];
  data: string;
  transactionHash?: string | null;
  blockNumber?: bigint | number | null;
  logIndex?: number | null;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// The public RPC rejects `eth_getLogs` ranges wider than 100,000 blocks.
const RECENT_TRANSFER_SPAN = 99_000n;

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/** Reads `symbol()`/`decimals()`; null if the address isn't a readable ERC-20. */
export async function fetchTokenMeta(address: string): Promise<TokenMeta | null> {
  try {
    const addr = address as ViemAddress;
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'symbol' }),
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'decimals' }),
    ]);
    return { symbol, decimals };
  } catch {
    return null;
  }
}

function cleanLabel(value: string | null, max: number): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text || text.length > max || /[^\x20-\x7E]/.test(text)) return null;
  return text;
}

/** Turn raw `name` / `symbol` / `decimals` / `totalSupply` reads into a profile. */
export function erc20ProfileFromReads(reads: {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: bigint | null;
}): Erc20Profile | null {
  const symbol = cleanLabel(reads.symbol, 32);
  const { decimals, totalSupply } = reads;
  if (!symbol || decimals === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  if (typeof totalSupply !== 'bigint' || totalSupply < 0n) return null;
  return {
    name: cleanLabel(reads.name, 64) ?? symbol,
    symbol,
    decimals,
    totalSupply,
  };
}

/** Reads ERC-20 metadata. Null when the address doesn't implement the views. */
export async function fetchErc20Profile(address: string): Promise<Erc20Profile | null> {
  if (!isAddress(address)) return null;
  const addr = address as ViemAddress;
  try {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'name' }).catch(() => null),
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => null),
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => null),
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'totalSupply' }).catch(() => null),
    ]);
    return erc20ProfileFromReads({ name, symbol, decimals, totalSupply });
  } catch {
    return null;
  }
}

export function tokenMovement(from: string, to: string): 'mint' | 'burn' | 'transfer' {
  if (from.toLowerCase() === ZERO_ADDRESS) return 'mint';
  if (to.toLowerCase() === ZERO_ADDRESS) return 'burn';
  return 'transfer';
}

/** Decode one log as a Transfer of `token`. Null for anything else. */
export function readTransferLog(token: string, log: RawTransferLog): TokenTransfer | null {
  if (log.address.toLowerCase() !== token.toLowerCase()) return null;
  if (!log.transactionHash || log.blockNumber == null) return null;
  const decoded = decodeErc20TransferLog({
    address: log.address,
    topics: log.topics.map((topic) => topic.toLowerCase()) as Hex[],
    data: (log.data || '0x') as Hex,
    logIndex: log.logIndex ?? 0,
    decoded: null,
  });
  if (!decoded) return null;
  const blockNumber = typeof log.blockNumber === 'bigint' ? Number(log.blockNumber) : log.blockNumber;
  if (!Number.isSafeInteger(blockNumber)) return null;
  try {
    return {
      txHash: log.transactionHash,
      blockNumber,
      logIndex: log.logIndex ?? 0,
      from: decoded.from,
      to: decoded.to,
      amount: BigInt(decoded.amount),
    };
  } catch {
    return null;
  }
}

/** Dedupe by tx + log index and order newest first. */
export function mergeTokenTransfers(rows: TokenTransfer[]): TokenTransfer[] {
  const seen = new Set<string>();
  const merged: TokenTransfer[] = [];
  for (const row of rows) {
    const key = `${row.txHash.toLowerCase()}:${row.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  merged.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
  return merged;
}

function transfersFromLogs(token: string, logs: RawTransferLog[]): TokenTransfer[] {
  return logs.flatMap((log) => {
    const row = readTransferLog(token, log);
    return row ? [row] : [];
  });
}

async function recentTransferLogs(token: ViemAddress): Promise<TokenTransfer[]> {
  try {
    const head = await client.getBlockNumber();
    const fromBlock = head > RECENT_TRANSFER_SPAN ? head - RECENT_TRANSFER_SPAN : 0n;
    const logs = await client.getLogs({
      address: token,
      event: TRANSFER_EVENT,
      fromBlock,
      toBlock: head,
    });
    return transfersFromLogs(token, logs);
  } catch {
    return [];
  }
}

/** Transfer rows from one explorer transaction payload. */
export function transfersInExplorerTx(token: string, hash: string, tx: ExplorerTxResponse): TokenTransfer[] {
  if (!tx.blockNumber) return [];
  let blockNumber: number;
  try {
    blockNumber = Number(BigInt(tx.blockNumber));
  } catch {
    return [];
  }
  if (!Number.isSafeInteger(blockNumber)) return [];
  return transfersFromLogs(
    token,
    tx.logs.map((log) => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
      transactionHash: tx.hash || hash,
      blockNumber,
      logIndex: log.logIndex,
    })),
  );
}

// The public RPC rate-limits large parallel `eth_getTransactionReceipt` bursts,
// so indexed history comes from the explorer API instead. A small pool keeps
// that fan-out polite.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function transfersFromExplorer(token: string, txHashes: string[]): Promise<TokenTransfer[]> {
  const txs = await mapPool(txHashes, 8, async (hash) => {
    try {
      return { hash, tx: await vibenetApi.explorer.tx(hash) };
    } catch {
      return null;
    }
  });
  return txs.flatMap((row) => (row ? transfersInExplorerTx(token, row.hash, row.tx) : []));
}

/**
 * Transfers for a token page: Transfer logs from the indexed transactions
 * (which reach further back than `eth_getLogs` allows) plus every Transfer
 * in the most recent block window, so account-batched transfers that never
 * set the token as the transaction's `to` still show up.
 */
export async function fetchTokenTransfers(token: string, txHashes: string[]): Promise<TokenTransfer[]> {
  if (!isAddress(token)) return [];
  const unique = [...new Set(txHashes.filter((hash) => /^0x[0-9a-fA-F]{64}$/.test(hash)).map((hash) => hash.toLowerCase()))];
  const [recent, historical] = await Promise.all([
    recentTransferLogs(token as ViemAddress),
    transfersFromExplorer(token, unique),
  ]);
  return mergeTokenTransfers([...recent, ...historical]);
}
