import { resolveTipsChain, type TipsChain } from '../../../../tips/chains';
import { getRpcUrl } from '../../config';
import {
  type BlockData,
  type BlockTransaction,
  cacheBlockData,
  getBlockFromCache,
  getBundleHistory,
  getTransactionMetadataByHash,
} from '../../s3';

import { tipsDisabledResponse } from '../../guard';

export const runtime = 'nodejs';

function serializeBlockData(block: BlockData) {
  return {
    ...block,
    number: block.number.toString(),
    timestamp: block.timestamp.toString(),
    gasUsed: block.gasUsed.toString(),
    gasLimit: block.gasLimit.toString(),
    transactions: block.transactions.map((tx) => {
      let metering: { transaction: unknown; bundle: unknown } | null = null;
      if (tx.meterBundleResponse) {
        const { results, ...bundle } = tx.meterBundleResponse;
        const txResults = results as unknown[] | undefined;
        metering = { transaction: txResults?.[0] ?? null, bundle };
      }
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        gasLimit: tx.gasLimit.toString(),
        bundleId: tx.bundleId,
        index: tx.index,
        metering,
      };
    }),
  };
}

// Minimal parsed shape from a raw JSON-RPC eth_getBlockBy* result. Omni has no
// viem dependency, so RPC blocks are fetched directly and hex fields decoded to
// bigint here (replacing viem's createPublicClient/getBlock).
interface ParsedBlock {
  hash: string;
  number: bigint;
  timestamp: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  transactions: Array<{
    hash: string;
    from: string;
    to: string | null;
    gas: bigint;
  }>;
}

interface RpcTransaction {
  hash: string;
  from: string;
  to: string | null;
  gas: string;
}

interface RpcBlock {
  hash: string;
  number: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  transactions: RpcTransaction[];
}

function parseRpcBlock(block: RpcBlock): ParsedBlock {
  return {
    hash: block.hash,
    number: BigInt(block.number),
    timestamp: BigInt(block.timestamp),
    gasUsed: BigInt(block.gasUsed),
    gasLimit: BigInt(block.gasLimit),
    transactions: (block.transactions ?? []).map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      gas: BigInt(tx.gas),
    })),
  };
}

async function fetchBlockByRpc(
  rpcUrl: string,
  method: 'eth_getBlockByHash' | 'eth_getBlockByNumber',
  identifier: string,
): Promise<ParsedBlock | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params: [identifier, true],
        id: 1,
      }),
    });

    const data = await response.json();
    if (data.error || !data.result) {
      return null;
    }

    return parseRpcBlock(data.result as RpcBlock);
  } catch (error) {
    console.error(`Failed to fetch block from RPC (${method}):`, error);
    return null;
  }
}

function fetchBlockFromRpc(rpcUrl: string, blockHash: string): Promise<ParsedBlock | null> {
  return fetchBlockByRpc(rpcUrl, 'eth_getBlockByHash', blockHash);
}

function isBlockNumber(identifier: string): boolean {
  return /^\d+$/.test(identifier);
}

function fetchBlockFromRpcByNumber(
  rpcUrl: string,
  blockNumber: string,
): Promise<ParsedBlock | null> {
  return fetchBlockByRpc(rpcUrl, 'eth_getBlockByNumber', `0x${BigInt(blockNumber).toString(16)}`);
}

async function enrichTransactionWithBundleData(
  chain: TipsChain,
  txHash: string,
): Promise<{
  bundleId: string | null;
  meterBundleResponse: Record<string, unknown> | null;
}> {
  const metadata = await getTransactionMetadataByHash(chain, txHash);
  if (!metadata || metadata.bundle_ids.length === 0) {
    return { bundleId: null, meterBundleResponse: null };
  }

  const bundleId = metadata.bundle_ids[0];
  const bundleHistory = await getBundleHistory(chain, bundleId);
  if (!bundleHistory) {
    return { bundleId, meterBundleResponse: null };
  }

  const receivedEvent = bundleHistory.history.find((e) => e.event === 'Received');
  if (!receivedEvent?.data?.bundle?.meter_bundle_response) {
    return { bundleId, meterBundleResponse: null };
  }

  return {
    bundleId,
    meterBundleResponse: receivedEvent.data.bundle
      .meter_bundle_response as unknown as Record<string, unknown>,
  };
}

async function buildAndCacheBlockData(
  chain: TipsChain,
  rpcBlock: ParsedBlock,
  hash: string,
  number: bigint,
): Promise<BlockData> {
  const transactions: BlockTransaction[] = await Promise.all(
    rpcBlock.transactions.map(async (tx, index) => {
      const enriched = await enrichTransactionWithBundleData(chain, tx.hash);
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        gasLimit: tx.gas,
        bundleId: enriched.bundleId,
        index,
        meterBundleResponse: enriched.meterBundleResponse,
      };
    }),
  );

  const blockData: BlockData = {
    hash,
    number,
    timestamp: rpcBlock.timestamp,
    transactions,
    gasUsed: rpcBlock.gasUsed,
    gasLimit: rpcBlock.gasLimit,
    cachedAt: Date.now(),
  };

  await cacheBlockData(chain, blockData);

  return blockData;
}

// On OP Stack, the first transaction (index 0) is the L1 attributes deposit transaction.
// This is not a perfect check (ideally we'd check tx.type === 'deposit' or type 0x7e),
// but sufficient for filtering out system transactions that don't need simulation data.
function isSystemTransaction(tx: BlockTransaction): boolean {
  return tx.index === 0;
}

async function refetchMissingTransactionSimulations(
  chain: TipsChain,
  block: BlockData,
): Promise<{ updatedBlock: BlockData; hasUpdates: boolean }> {
  const transactionsToRefetch = block.transactions.filter(
    (tx) => tx.bundleId === null && !isSystemTransaction(tx),
  );

  if (transactionsToRefetch.length === 0) {
    return { updatedBlock: block, hasUpdates: false };
  }

  const refetchResults = await Promise.all(
    transactionsToRefetch.map(async (tx) => {
      const enriched = await enrichTransactionWithBundleData(chain, tx.hash);
      return { hash: tx.hash, ...enriched };
    }),
  );

  let hasUpdates = false;
  const updatedTransactions = block.transactions.map((tx) => {
    const refetchResult = refetchResults.find((r) => r.hash === tx.hash);
    if (refetchResult && refetchResult.bundleId !== null) {
      hasUpdates = true;
      return {
        ...tx,
        bundleId: refetchResult.bundleId,
        meterBundleResponse: refetchResult.meterBundleResponse,
      };
    }
    return tx;
  });

  return {
    updatedBlock: {
      ...block,
      transactions: updatedTransactions,
      cachedAt: hasUpdates ? Date.now() : block.cachedAt,
    },
    hasUpdates,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));
  const rpcUrl = getRpcUrl(chain);

  try {
    const { hash: identifier } = await params;

    // If the identifier is a block number, resolve it to a hash first
    if (isBlockNumber(identifier)) {
      const rpcBlock = await fetchBlockFromRpcByNumber(rpcUrl, identifier);
      if (!rpcBlock || !rpcBlock.hash) {
        return Response.json({ error: 'Block not found' }, { status: 404 });
      }

      // Check cache by resolved hash
      const cachedBlock = await getBlockFromCache(chain, rpcBlock.hash);
      if (cachedBlock) {
        const { updatedBlock, hasUpdates } = await refetchMissingTransactionSimulations(
          chain,
          cachedBlock,
        );
        if (hasUpdates) {
          await cacheBlockData(chain, updatedBlock);
        }
        return Response.json(serializeBlockData(updatedBlock));
      }

      const blockData = await buildAndCacheBlockData(
        chain,
        rpcBlock,
        rpcBlock.hash,
        rpcBlock.number,
      );
      return Response.json(serializeBlockData(blockData));
    }

    const cachedBlock = await getBlockFromCache(chain, identifier);
    if (cachedBlock) {
      const { updatedBlock, hasUpdates } = await refetchMissingTransactionSimulations(
        chain,
        cachedBlock,
      );

      if (hasUpdates) {
        await cacheBlockData(chain, updatedBlock);
      }

      return Response.json(serializeBlockData(updatedBlock));
    }

    const rpcBlock = await fetchBlockFromRpc(rpcUrl, identifier);
    if (!rpcBlock || !rpcBlock.hash) {
      return Response.json({ error: 'Block not found' }, { status: 404 });
    }

    const blockData = await buildAndCacheBlockData(chain, rpcBlock, rpcBlock.hash, rpcBlock.number);
    return Response.json(serializeBlockData(blockData));
  } catch (error) {
    console.error('Error fetching block data:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
