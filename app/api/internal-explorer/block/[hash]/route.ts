import { type Hash } from 'viem';

import { type ExplorerChain } from '../../../../internal-explorer/chains';
import { calculateTransactionFee } from '../../../../internal-explorer/library/explorer-format';
import { inclusionLatencyMs, type TimedExplorerEvent } from '../../../../internal-explorer/library/inclusion-latency';
import { resolveExplorerChainFromRequest } from '../../chain';
import {
  bundleHistoryFromAuditEvents,
  getAuditEventsByBlockNumber,
  getAuditEventsByTransactionHash,
  mergeAuditEvents,
  meterBundleResponseFromAuditEvent,
  transactionMetadataFromAuditEvents,
  type AuditTransactionEventRecord,
} from '../../audit-events';
import { getAuditRpcUrl, getRpcUrl } from '../../config';
import { explorerDisabledResponse } from '../../guard';
import { getTransactionReceiptSummaries } from '../../receipts';
import {
  cacheBlockData,
  getBlockFromCache,
  getBundleHistory,
  getTransactionMetadataByHash,
} from '../../s3';
import type { BlockData, BlockTransaction, BundleEvent } from '../../transaction-data';
import { publicClientFor } from '../../viem';

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
        inclusionLatencyMs: tx.inclusionLatencyMs ?? null,
      };
    }),
    eventHistory: block.eventHistory ?? [],
  };
}

// Parsed block shape consumed by buildBlockData. Fetched via viem getBlock,
// which already decodes hex fields to bigint.
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

// Structural mapper from a viem full block (includeTransactions: true) to the
// shape buildBlockData needs.
function toParsedFullBlock(block: {
  hash: string | null;
  number: bigint | null;
  timestamp: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  baseFeePerGas: bigint | null;
  transactions: ReadonlyArray<{
    hash: string;
    from: string;
    to: string | null;
    input: string;
    value: bigint;
    gas: bigint;
  }>;
}): ParsedFullBlock | null {
  if (!block.hash || block.number === null) return null;
  return {
    hash: block.hash,
    number: block.number,
    timestamp: block.timestamp,
    gasUsed: block.gasUsed,
    gasLimit: block.gasLimit,
    baseFeePerGas: block.baseFeePerGas,
    transactions: block.transactions.map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      input: tx.input,
      value: tx.value,
      gas: tx.gas,
    })),
  };
}

async function fetchBlockFromRpc(rpcUrl: string, blockHash: string): Promise<ParsedFullBlock | null> {
  try {
    const block = await publicClientFor(rpcUrl).getBlock({
      blockHash: blockHash as Hash,
      includeTransactions: true,
    });
    return toParsedFullBlock(block);
  } catch {
    return null;
  }
}

async function fetchBlockFromRpcByNumber(
  rpcUrl: string,
  blockNumber: string,
): Promise<ParsedFullBlock | null> {
  try {
    const block = await publicClientFor(rpcUrl).getBlock({
      blockNumber: BigInt(blockNumber),
      includeTransactions: true,
    });
    return toParsedFullBlock(block);
  } catch {
    return null;
  }
}

function isBlockNumber(identifier: string): boolean {
  return /^\d+$/.test(identifier);
}

function timedAuditEvents(events: AuditTransactionEventRecord[]): TimedExplorerEvent[] {
  return events.map((event) => ({
    event: event.event_type,
    timestamp: Date.parse(event.event_time),
  }));
}

function timedHistoryEvents(history: BundleEvent[]): TimedExplorerEvent[] {
  return history.map((event) => ({
    event: event.event,
    timestamp: event.data.timestamp,
  }));
}

function auditEventsForHash(
  txHash: string,
  events: AuditTransactionEventRecord[],
): AuditTransactionEventRecord[] {
  const normalized = txHash.toLowerCase();
  return events.filter((event) => event.tx_hash?.toLowerCase() === normalized);
}

async function enrichTransactionFromS3(
  chain: ExplorerChain,
  txHash: string,
): Promise<{
  bundleId: string | null;
  meterBundleResponse: Record<string, unknown> | null;
  history: BundleEvent[];
}> {
  const metadata = await getTransactionMetadataByHash(chain, txHash);
  if (!metadata || metadata.bundle_ids.length === 0) {
    return { bundleId: null, meterBundleResponse: null, history: [] };
  }

  const bundleId = metadata.bundle_ids[0];
  const bundleHistory = await getBundleHistory(chain, bundleId);
  if (!bundleHistory) {
    return { bundleId, meterBundleResponse: null, history: [] };
  }

  const receivedEvent = bundleHistory.history.find((event) => event.event === 'Received');
  return {
    bundleId,
    meterBundleResponse: receivedEvent?.data?.bundle?.meter_bundle_response
      ? (receivedEvent.data.bundle.meter_bundle_response as unknown as Record<string, unknown>)
      : null,
    history: bundleHistory.history,
  };
}

type TransactionEnrichment = {
  bundleId: string | null;
  meterBundleResponse: Record<string, unknown> | null;
  inclusionLatencyMs: number | null;
};

// Audit-first, S3-fallback per-transaction enrichment (bundle id, metering, and
// inclusion latency from the same event set the transaction page uses).
async function enrichTransactionWithBundleData(
  chain: ExplorerChain,
  txHash: string,
  blockAuditEvents: AuditTransactionEventRecord[],
): Promise<TransactionEnrichment> {
  const auditRpcUrl = getAuditRpcUrl(chain);
  let hashEvents: AuditTransactionEventRecord[] = [];

  if (auditRpcUrl) {
    try {
      hashEvents = await getAuditEventsByTransactionHash(auditRpcUrl, txHash);
    } catch {
      // Audit is an optional read path; fall back to the S3-backed enrichment on errors.
    }
  }

  const mergedAuditEvents = mergeAuditEvents([
    hashEvents,
    auditEventsForHash(txHash, blockAuditEvents),
  ]);
  let inclusionLatency = inclusionLatencyMs(timedAuditEvents(mergedAuditEvents));

  const metadata = transactionMetadataFromAuditEvents(hashEvents);
  let bundleId = metadata?.bundle_ids[0] ?? null;
  let meterBundleResponse: Record<string, unknown> | null = null;
  if (bundleId !== null) {
    const accepted = hashEvents.find((event) => event.event_type === 'SIMULATION_SUCCEEDED');
    meterBundleResponse = accepted
      ? (meterBundleResponseFromAuditEvent(accepted) as unknown as Record<string, unknown>)
      : null;
  }

  if (bundleId === null) {
    const s3 = await enrichTransactionFromS3(chain, txHash);
    bundleId = s3.bundleId;
    meterBundleResponse = s3.meterBundleResponse;
    inclusionLatency = inclusionLatency ?? inclusionLatencyMs(timedHistoryEvents(s3.history));
  }

  return {
    bundleId,
    meterBundleResponse,
    inclusionLatencyMs: inclusionLatency,
  };
}

async function loadBlockAuditEvents(
  chain: ExplorerChain,
  number: bigint,
): Promise<AuditTransactionEventRecord[]> {
  const auditRpcUrl = getAuditRpcUrl(chain);
  if (!auditRpcUrl) {
    return [];
  }

  try {
    return await getAuditEventsByBlockNumber(auditRpcUrl, Number(number));
  } catch (error) {
    console.error('Failed to fetch block event history from audit RPC:', error);
    return [];
  }
}

async function buildBlockData(chain: ExplorerChain, rpcBlock: ParsedFullBlock): Promise<BlockData> {
  const rpcUrl = getRpcUrl(chain);
  const [receiptByHash, blockAuditEvents] = await Promise.all([
    getTransactionReceiptSummaries(
      rpcUrl,
      rpcBlock.transactions.map((tx) => tx.hash),
    ),
    loadBlockAuditEvents(chain, rpcBlock.number),
  ]);
  const transactions: BlockTransaction[] = await Promise.all(
    rpcBlock.transactions.map(async (tx, index) => {
      const enriched = await enrichTransactionWithBundleData(chain, tx.hash, blockAuditEvents);
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
        inclusionLatencyMs: enriched.inclusionLatencyMs,
      };
    }),
  );

  return {
    hash: rpcBlock.hash,
    number: rpcBlock.number,
    timestamp: rpcBlock.timestamp,
    transactions,
    eventHistory:
      bundleHistoryFromAuditEvents(
        rpcBlock.hash,
        blockAuditEvents.filter((event) => BLOCK_EVENT_TYPES.has(event.event_type)),
      )?.history ?? [],
    gasUsed: rpcBlock.gasUsed,
    gasLimit: rpcBlock.gasLimit,
    baseFeePerGas: rpcBlock.baseFeePerGas,
    cachedAt: Date.now(),
  };
}

// Build live from RPC (audit-first enrichment), writing through to the block
// cache, which also serves as a fallback when the RPC is unavailable.
async function buildAndCacheBlockData(
  chain: ExplorerChain,
  rpcBlock: ParsedFullBlock,
): Promise<BlockData> {
  const blockData = await buildBlockData(chain, rpcBlock);
  await cacheBlockData(chain, blockData);
  return blockData;
}

export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveExplorerChainFromRequest(request);
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
      // RPC could not serve the block; fall back to the block cache.
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
