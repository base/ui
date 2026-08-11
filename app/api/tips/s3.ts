// S3 data access for the TIPS API. Ported from tips-ui src/lib/s3.ts, but every
// data function is chain-aware: it takes a TipsChain and resolves the per-chain
// S3 client + bucket from config.ts instead of a module-level singleton, so one
// deployment can serve all chains.
//
// With the observability migration, S3 is the *fallback* source: routes prefer
// the audit events RPC (audit-events.ts) and fall back here when audit is not
// configured or returns nothing. The block read-through cache (getBlockFromCache /
// cacheBlockData) is this app's own cache of RPC block data and is intentionally
// retained through the migration.
//
// Domain types live in transaction-data.ts and are re-exported here so existing
// importers keep working. Server-only: never import from client.
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import type { TipsChain } from '../../tips/chains';
import { getBucketName, getS3Client } from './config';
import type {
  BlockData,
  BundleEvent,
  BundleHistory,
  RejectedTransaction,
  TransactionMetadata,
} from './transaction-data';

export type {
  BlockData,
  BlockTransaction,
  BundleData,
  BundleEvent,
  BundleEventData,
  BundleHistory,
  BundleTransaction,
  MeterBundleResponse,
  MeterBundleResult,
  RejectedTransaction,
  RejectionReason,
  TransactionMetadata,
} from './transaction-data';
export { formatRejectionReason } from './transaction-data';

async function getObjectContent(chain: TipsChain, key: string): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: getBucketName(chain),
      Key: key,
    });

    const response = await getS3Client(chain).send(command);
    const body = await response.Body?.transformToString();
    return body || null;
  } catch (_error) {
    return null;
  }
}

export async function getTransactionMetadataByHash(
  chain: TipsChain,
  hash: string,
): Promise<TransactionMetadata | null> {
  const key = `transactions/by_hash/${hash}`;
  const content = await getObjectContent(chain, key);

  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as TransactionMetadata;
  } catch (error) {
    console.error(`Failed to parse transaction metadata for hash ${hash}:`, error);
    return null;
  }
}

export async function getBundleHistory(
  chain: TipsChain,
  bundleKey: string,
): Promise<BundleHistory | null> {
  const prefix = `bundles/${bundleKey}/`;
  const listCommand = new ListObjectsV2Command({
    Bucket: getBucketName(chain),
    Prefix: prefix,
  });

  const listResponse = await getS3Client(chain).send(listCommand);
  const keys = listResponse.Contents?.map((obj) => obj.Key).filter(Boolean) as string[];

  if (!keys || keys.length === 0) {
    return null;
  }

  const history: BundleEvent[] = [];
  for (const key of keys) {
    const content = await getObjectContent(chain, key);
    if (content) {
      try {
        history.push(JSON.parse(content) as BundleEvent);
      } catch (error) {
        console.error(`Failed to parse event at ${key}:`, error);
      }
    }
  }

  return { history };
}

export async function getBlockFromCache(
  chain: TipsChain,
  blockHash: string,
): Promise<BlockData | null> {
  const key = `blocks/${blockHash}`;
  const content = await getObjectContent(chain, key);

  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    return {
      ...parsed,
      number: BigInt(parsed.number),
      timestamp: BigInt(parsed.timestamp),
      gasUsed: BigInt(parsed.gasUsed),
      gasLimit: BigInt(parsed.gasLimit),
      baseFeePerGas:
        parsed.baseFeePerGas === null || parsed.baseFeePerGas === undefined
          ? null
          : BigInt(parsed.baseFeePerGas),
      transactions: parsed.transactions.map(
        (tx: { gasLimit?: string; [key: string]: unknown }) => ({
          ...tx,
          blockHash: String(tx.blockHash ?? parsed.hash ?? blockHash),
          blockNumber: BigInt((tx.blockNumber as string) ?? parsed.number),
          blockTimestamp: BigInt((tx.blockTimestamp as string) ?? parsed.timestamp),
          input: String(tx.input ?? '0x'),
          value: BigInt(String(tx.value ?? '0')),
          gasLimit: BigInt(tx.gasLimit ?? '0'),
          gasUsed:
            tx.gasUsed === null || tx.gasUsed === undefined ? null : BigInt(tx.gasUsed as string),
          effectiveGasPrice:
            tx.effectiveGasPrice === null || tx.effectiveGasPrice === undefined
              ? null
              : BigInt(tx.effectiveGasPrice as string),
          transactionFee:
            tx.transactionFee === null || tx.transactionFee === undefined
              ? null
              : BigInt(tx.transactionFee as string),
          meterBundleResponse: tx.meterBundleResponse ?? null,
        }),
      ),
    } as BlockData;
  } catch (error) {
    console.error(`Failed to parse block data for hash ${blockHash}:`, error);
    return null;
  }
}

export interface RejectedTransactionSummary {
  blockNumber: number;
  txHash: string;
}

export async function listRejectedTransactions(
  chain: TipsChain,
  limit = 100,
): Promise<RejectedTransactionSummary[]> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: getBucketName(chain),
      Prefix: 'rejected/',
      MaxKeys: limit,
    });

    const response = await getS3Client(chain).send(command);
    const contents = response.Contents || [];

    const summaries: RejectedTransactionSummary[] = [];
    for (const obj of contents) {
      if (!obj.Key) continue;
      // S3 key format matches Rust S3Key::Rejected: rejected/{block_number}/{tx_hash}
      const parts = obj.Key.split('/');
      if (parts.length !== 3) continue;
      const blockNumber = parseInt(parts[1], 10);
      const txHash = parts[2];
      if (Number.isNaN(blockNumber) || !txHash) continue;
      summaries.push({ blockNumber, txHash });
    }

    summaries.sort((a, b) => b.blockNumber - a.blockNumber);
    return summaries;
  } catch (error) {
    console.error('Failed to list rejected transactions:', error);
    return [];
  }
}

export async function getRejectedTransaction(
  chain: TipsChain,
  blockNumber: number,
  txHash: string,
): Promise<RejectedTransaction | null> {
  const key = `rejected/${blockNumber}/${txHash}`;
  const content = await getObjectContent(chain, key);

  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as RejectedTransaction;
  } catch (error) {
    console.error(`Failed to parse rejected transaction ${blockNumber}/${txHash}:`, error);
    return null;
  }
}

export async function cacheBlockData(chain: TipsChain, blockData: BlockData): Promise<void> {
  const key = `blocks/${blockData.hash}`;

  try {
    const command = new PutObjectCommand({
      Bucket: getBucketName(chain),
      Key: key,
      Body: JSON.stringify(blockData, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
      ContentType: 'application/json',
    });

    await getS3Client(chain).send(command);
  } catch (error) {
    console.error(`Failed to cache block data for ${blockData.hash}:`, error);
  }
}
