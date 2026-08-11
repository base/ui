import { resolveTipsChain, type TipsChain } from '../../../../tips/chains';
import { calculateTransactionFee } from '../../../../tips/library/explorer-format';
import {
  bundleHistoryFromAuditEvents,
  getAuditEventsByBlockNumber,
  getAuditEventsByTransactionHash,
  meterBundleResponseFromAuditEvent,
  transactionMetadataFromAuditEvents,
} from '../../audit-events';
import { getAuditRpcUrl, getRpcUrl } from '../../config';
import { tipsDisabledResponse } from '../../guard';
import { getTransactionReceiptSummaries } from '../../receipts';
import { hexToBigInt, rpcCall, toBlockTag } from '../../rpc';
import {
  cacheBlockData,
  getBlockFromCache,
  getBundleHistory,
  getTransactionMetadataByHash,
} from '../../s3';
import type { BlockData, BlockTransaction, BundleEvent } from '../../transaction-data';

export const runtime = 'nodejs';

const BLOCK_EVENT_TYPES = new Set([
  'BUILDER_FLASHBLOCK_STARTED',
  'BUILDER_FLASHBLOCK_PUBLISHED',
  'BUILDER_FLASHBLOCK_BUILD_STOPPED',
  'BUILDER_PAYLOAD_FINALIZED',
]);

function serializeBlockData(block: BlockData) {
  return {
    ...block,
    number: block.number.toString(),
    timestamp: block.timestamp.toString(),
    gasUsed: block.gasUsed.toString(),
    gasLimit: block.gasLimit.toString(),
    baseFeePerGas: block.baseFeePerGas?.toString() ?? null,
    transactions: block.transactions.map((tx) => {
      let metering: { transaction: unknown; bundle: unknown } | null = null;
      if (tx.meterBundleResponse) {
        const { results, ...bundle } = tx.meterBundleResponse;
        const txResults = results as unknown[] | undefined;
        metering = { transaction: txResults?.[0] ?? null, bundle };
      }
      return {
        hash: tx.hash,
        blockHash: tx.blockHash,
        blockNumber: tx.blockNumber.toString(),
        blockTimestamp: tx.blockTimestamp.toString(),
        from: tx.from,
        to: tx.to,
        input: tx.input,
        value: tx.value.toString(),
        gasLimit: tx.gasLimit.toString(),
        gasUsed: tx.gasUsed?.toString() ?? null,
        effectiveGasPrice: tx.effectiveGasPrice?.toString() ?? null,
        transactionFee: tx.transactionFee?.toString() ?? null,
        bundleId: tx.bundleId,
        index: tx.index,
        metering,
      };
    }),
    eventHistory: block.eventHistory ?? [],
  };
}

// Minimal parsed shape from a raw JSON-RPC eth_getBlockBy* result with full
// transaction objects. Omni has no viem dependency, so blocks are fetched
// directly and hex fields decoded to bigint here.
interface ParsedFullTransaction {
  hash: string;
  from: string;
  to: string | null;
  input: string;
  value: bigint;
  gas: bigint;
}

interface ParsedFullBlock {
  hash: string;
  number: bigint;
  timestamp: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  baseFeePerGas: bigint | null;
  transactions: ParsedFullTransaction[];
}

function parseFullTransaction(value: unknown): ParsedFullTransaction | null {
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

function parseFullBlock(value: unknown): ParsedFullBlock | null {
  if (!value || typeof value !== 'object') return null;
  const block = value as Record<string, unknown>;
  const number = hexToBigInt(block.number);
  const timestamp = hexToBigInt(block.timestamp);
  const gasUsed = hexToBigInt(block.gasUsed);
  const gasLimit = hexToBigInt(block.gasLimit);
  if (
    typeof block.hash !== 'string' ||
    number === null ||
    timestamp === null ||
    gasUsed === null ||
    gasLimit === null
  ) {
    return null;
  }

  const transactions = Array.isArray(block.transactions)
    ? block.transactions.map(parseFullTransaction)
    : [];

  return {
    hash: block.hash,
    number,
    timestamp,
    gasUsed,
    gasLimit,
    baseFeePerGas: hexToBigInt(block.baseFeePerGas),
    transactions: transactions.filter((tx): tx is ParsedFullTransaction => tx !== null),
  };
}

async function fetchBlockFromRpc(rpcUrl: string, blockHash: string): Promise<ParsedFullBlock | null> {
  return parseFullBlock(await rpcCall(rpcUrl, 'eth_getBlockByHash', [blockHash, true]));
}

async function fetchBlockFromRpcByNumber(
  rpcUrl: string,
  blockNumber: string,
): Promise<ParsedFullBlock | null> {
  return parseFullBlock(
    await rpcCall(rpcUrl, 'eth_getBlockByNumber', [toBlockTag(BigInt(blockNumber)), true]),
  );
}

function isBlockNumber(identifier: string): boolean {
  return /^\d+$/.test(identifier);
}

async function enrichTransactionFromS3(
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

  const receivedEvent = bundleHistory.history.find((event) => event.event === 'Received');
  if (!receivedEvent?.data?.bundle?.meter_bundle_response) {
    return { bundleId, meterBundleResponse: null };
  }

  return {
    bundleId,
    meterBundleResponse: receivedEvent.data.bundle.meter_bundle_response as unknown as Record<
      string,
      unknown
    >,
  };
}

// Audit-first, S3-fallback per-transaction enrichment (bundle id + metering).
async function enrichTransactionWithBundleData(
  chain: TipsChain,
  txHash: string,
): Promise<{
  bundleId: string | null;
  meterBundleResponse: Record<string, unknown> | null;
}> {
  const auditRpcUrl = getAuditRpcUrl(chain);
  if (!auditRpcUrl) {
    return enrichTransactionFromS3(chain, txHash);
  }

  try {
    const events = await getAuditEventsByTransactionHash(auditRpcUrl, txHash);
    const metadata = transactionMetadataFromAuditEvents(events);
    const bundleId = metadata?.bundle_ids[0] ?? null;
    if (bundleId !== null) {
      const accepted = events.find((event) => event.event_type === 'SIMULATION_SUCCEEDED');
      return {
        bundleId,
        meterBundleResponse: accepted
          ? (meterBundleResponseFromAuditEvent(accepted) as unknown as Record<string, unknown>)
          : null,
      };
    }
  } catch {
    // Audit is an optional read path; retain the S3-backed behavior on errors.
  }

  return enrichTransactionFromS3(chain, txHash);
}

async function getBlockEventHistory(
  chain: TipsChain,
  hash: string,
  number: bigint,
): Promise<BundleEvent[]> {
  const auditRpcUrl = getAuditRpcUrl(chain);
  if (!auditRpcUrl) {
    return [];
  }

  try {
    return (
      bundleHistoryFromAuditEvents(
        hash,
        (await getAuditEventsByBlockNumber(auditRpcUrl, Number(number))).filter((event) =>
          BLOCK_EVENT_TYPES.has(event.event_type),
        ),
      )?.history ?? []
    );
  } catch (error) {
    console.error('Failed to fetch block event history from audit RPC:', error);
    return [];
  }
}

async function buildBlockData(chain: TipsChain, rpcBlock: ParsedFullBlock): Promise<BlockData> {
  const rpcUrl = getRpcUrl(chain);
  const receiptByHash = await getTransactionReceiptSummaries(
    rpcUrl,
    rpcBlock.transactions.map((tx) => tx.hash),
  );
  const transactions: BlockTransaction[] = await Promise.all(
    rpcBlock.transactions.map(async (tx, index) => {
      const enriched = await enrichTransactionWithBundleData(chain, tx.hash);
      const receipt = receiptByHash.get(tx.hash);
      const effectiveGasPrice = receipt?.effectiveGasPrice ?? null;
      return {
        hash: tx.hash,
        blockHash: rpcBlock.hash,
        blockNumber: rpcBlock.number,
        blockTimestamp: rpcBlock.timestamp,
        from: tx.from,
        to: tx.to,
        input: tx.input,
        value: tx.value,
        gasLimit: tx.gas,
        gasUsed: receipt?.gasUsed ?? null,
        effectiveGasPrice,
        transactionFee: calculateTransactionFee(receipt?.gasUsed ?? null, effectiveGasPrice),
        bundleId: enriched.bundleId,
        index,
        meterBundleResponse: enriched.meterBundleResponse,
      };
    }),
  );

  return {
    hash: rpcBlock.hash,
    number: rpcBlock.number,
    timestamp: rpcBlock.timestamp,
    transactions,
    eventHistory: await getBlockEventHistory(chain, rpcBlock.hash, rpcBlock.number),
    gasUsed: rpcBlock.gasUsed,
    gasLimit: rpcBlock.gasLimit,
    baseFeePerGas: rpcBlock.baseFeePerGas,
    cachedAt: Date.now(),
  };
}

// Build live from RPC (audit-first enrichment), retaining Omni's own block cache
// as a write-through artifact + last-resort fallback when the RPC is unavailable.
async function buildAndCacheBlockData(
  chain: TipsChain,
  rpcBlock: ParsedFullBlock,
): Promise<BlockData> {
  const blockData = await buildBlockData(chain, rpcBlock);
  await cacheBlockData(chain, blockData);
  return blockData;
}

export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const disabled = tipsDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveTipsChain(new URL(request.url).searchParams.get('chain'));
  const rpcUrl = getRpcUrl(chain);

  try {
    const { hash: identifier } = await params;

    // If the identifier is a block number, resolve it via RPC first.
    if (isBlockNumber(identifier)) {
      const rpcBlock = await fetchBlockFromRpcByNumber(rpcUrl, identifier);
      if (!rpcBlock) {
        return Response.json({ error: 'Block not found' }, { status: 404 });
      }

      const blockData = await buildAndCacheBlockData(chain, rpcBlock);
      return Response.json(serializeBlockData(blockData));
    }

    const rpcBlock = await fetchBlockFromRpc(rpcUrl, identifier);
    if (!rpcBlock) {
      // RPC could not serve the block; fall back to Omni's block cache.
      const cachedBlock = await getBlockFromCache(chain, identifier);
      if (cachedBlock) {
        return Response.json(serializeBlockData(cachedBlock));
      }
      return Response.json({ error: 'Block not found' }, { status: 404 });
    }

    const blockData = await buildAndCacheBlockData(chain, rpcBlock);
    return Response.json(serializeBlockData(blockData));
  } catch (error) {
    console.error('Error fetching block data:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
