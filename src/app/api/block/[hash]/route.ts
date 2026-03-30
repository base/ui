import { type NextRequest, NextResponse } from "next/server";
import { type Block, createPublicClient, type Hash, http } from "viem";
import { mainnet } from "viem/chains";
import {
  type BlockData,
  type BlockTransaction,
  cacheBlockData,
  getBlockFromCache,
  getBundleHistory,
  getTransactionMetadataByHash,
  type MeterBundleResult,
} from "@/lib/s3";

function serializeBlockData(block: BlockData) {
  return {
    ...block,
    number: block.number.toString(),
    timestamp: block.timestamp.toString(),
    gasUsed: block.gasUsed.toString(),
    gasLimit: block.gasLimit.toString(),
    transactions: block.transactions.map((tx) => ({
      ...tx,
      gasLimit: tx.gasLimit.toString(),
      gasUsed: tx.gasUsed?.toString() ?? null,
    })),
  };
}

const RPC_URL = process.env.TIPS_UI_RPC_URL || "http://localhost:8545";

const client = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL),
});

async function fetchBlockFromRpc(
  blockHash: string,
): Promise<Block<bigint, true> | null> {
  try {
    const block = await client.getBlock({
      blockHash: blockHash as Hash,
      includeTransactions: true,
    });
    return block;
  } catch (error) {
    console.error("Failed to fetch block from RPC:", error);
    return null;
  }
}

function isBlockNumber(identifier: string): boolean {
  return /^\d+$/.test(identifier);
}

async function fetchBlockFromRpcByNumber(
  blockNumber: string,
): Promise<Block<bigint, true> | null> {
  try {
    const block = await client.getBlock({
      blockNumber: BigInt(blockNumber),
      includeTransactions: true,
    });
    return block;
  } catch (error) {
    console.error("Failed to fetch block from RPC by number:", error);
    return null;
  }
}

async function buildAndCacheBlockData(
  rpcBlock: Block<bigint, true>,
  hash: Hash,
  number: bigint,
): Promise<BlockData> {
  const transactions: BlockTransaction[] = await Promise.all(
    rpcBlock.transactions.map(async (tx, index) => {
      const enriched = await enrichTransactionWithBundleData(tx.hash);
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        gasLimit: tx.gas,
        gasUsed: enriched.gasUsed != null ? BigInt(enriched.gasUsed) : null,
        executionTimeUs: enriched.executionTimeUs,
        stateRootTimeUs: enriched.stateRootTimeUs,
        bundleId: enriched.bundleId,
        index,
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

  await cacheBlockData(blockData);

  return blockData;
}

// On OP Stack, the first transaction (index 0) is the L1 attributes deposit transaction.
// This is not a perfect check (ideally we'd check tx.type === 'deposit' or type 0x7e),
// but sufficient for filtering out system transactions that don't need simulation data.
function isSystemTransaction(tx: BlockTransaction): boolean {
  return tx.index === 0;
}

async function enrichTransactionWithBundleData(txHash: string): Promise<{
  bundleId: string | null;
  executionTimeUs: number | null;
  stateRootTimeUs: number | null;
  gasUsed: number | null;
}> {
  const metadata = await getTransactionMetadataByHash(txHash);
  if (!metadata || metadata.bundle_ids.length === 0) {
    return {
      bundleId: null,
      executionTimeUs: null,
      stateRootTimeUs: null,
      gasUsed: null,
    };
  }

  const bundleId = metadata.bundle_ids[0];
  const bundleHistory = await getBundleHistory(bundleId);
  if (!bundleHistory) {
    return {
      bundleId,
      executionTimeUs: null,
      stateRootTimeUs: null,
      gasUsed: null,
    };
  }

  const receivedEvent = bundleHistory.history.find(
    (e) => e.event === "Received",
  );
  if (!receivedEvent?.data?.bundle?.meter_bundle_response?.results) {
    return {
      bundleId,
      executionTimeUs: null,
      stateRootTimeUs: null,
      gasUsed: null,
    };
  }

  const meterResponse = receivedEvent.data.bundle.meter_bundle_response;

  // TODO: Switch to meterResponse.totalExecutionTimeUs once 0.7 is deployed.
  // On 0.6, totalExecutionTimeUs is the wall-clock total_time_us which includes
  // setup, teardown, and state root (double-counting stateRootTimeUs). PR #1111
  // fixes this on main to be the sum of per-tx execution times.
  const txResult = meterResponse.results.find(
    (r: MeterBundleResult) => r.txHash.toLowerCase() === txHash.toLowerCase(),
  );

  return {
    bundleId,
    executionTimeUs: txResult?.executionTimeUs ?? null,
    stateRootTimeUs: meterResponse.stateRootTimeUs ?? null,
    gasUsed: txResult?.gasUsed ?? null,
  };
}

async function refetchMissingTransactionSimulations(
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
      const enriched = await enrichTransactionWithBundleData(tx.hash);
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
        executionTimeUs: refetchResult.executionTimeUs,
        stateRootTimeUs: refetchResult.stateRootTimeUs,
        ...(refetchResult.gasUsed != null && {
          gasUsed: BigInt(refetchResult.gasUsed),
        }),
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
) {
  try {
    const { hash: identifier } = await params;

    // If the identifier is a block number, resolve it to a hash first
    if (isBlockNumber(identifier)) {
      const rpcBlock = await fetchBlockFromRpcByNumber(identifier);
      if (!rpcBlock || !rpcBlock.hash || !rpcBlock.number) {
        return NextResponse.json({ error: "Block not found" }, { status: 404 });
      }

      // Check cache by resolved hash
      const cachedBlock = await getBlockFromCache(rpcBlock.hash);
      if (cachedBlock) {
        const { updatedBlock, hasUpdates } =
          await refetchMissingTransactionSimulations(cachedBlock);
        if (hasUpdates) {
          await cacheBlockData(updatedBlock);
        }
        return NextResponse.json(serializeBlockData(updatedBlock));
      }

      const blockData = await buildAndCacheBlockData(
        rpcBlock,
        rpcBlock.hash,
        rpcBlock.number,
      );
      return NextResponse.json(serializeBlockData(blockData));
    }

    const cachedBlock = await getBlockFromCache(identifier);
    if (cachedBlock) {
      const { updatedBlock, hasUpdates } =
        await refetchMissingTransactionSimulations(cachedBlock);

      if (hasUpdates) {
        await cacheBlockData(updatedBlock);
      }

      return NextResponse.json(serializeBlockData(updatedBlock));
    }

    const rpcBlock = await fetchBlockFromRpc(identifier);
    if (!rpcBlock || !rpcBlock.hash || !rpcBlock.number) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    const blockData = await buildAndCacheBlockData(
      rpcBlock,
      rpcBlock.hash,
      rpcBlock.number,
    );
    return NextResponse.json(serializeBlockData(blockData));
  } catch (error) {
    console.error("Error fetching block data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
