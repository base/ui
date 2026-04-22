import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

function createS3Client(): S3Client {
  const configType = process.env.TIPS_UI_S3_CONFIG_TYPE || "aws";
  const region = process.env.TIPS_UI_AWS_REGION || "us-east-1";

  if (configType === "manual") {
    console.log("Using Manual S3 configuration");
    const config: S3ClientConfig = {
      region,
      forcePathStyle: true,
    };

    if (process.env.TIPS_UI_S3_ENDPOINT) {
      config.endpoint = process.env.TIPS_UI_S3_ENDPOINT;
    }

    if (
      process.env.TIPS_UI_S3_ACCESS_KEY_ID &&
      process.env.TIPS_UI_S3_SECRET_ACCESS_KEY
    ) {
      config.credentials = {
        accessKeyId: process.env.TIPS_UI_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.TIPS_UI_S3_SECRET_ACCESS_KEY,
      };
    }

    return new S3Client(config);
  }

  console.log("Using AWS S3 configuration");
  return new S3Client({
    region,
  });
}

const s3Client = createS3Client();

const BUCKET_NAME = process.env.TIPS_UI_S3_BUCKET_NAME || "tips";

export interface TransactionMetadata {
  bundle_ids: string[];
  sender: string;
  nonce: string;
}

async function getObjectContent(key: string): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    return body || null;
  } catch (_error) {
    return null;
  }
}

export async function getTransactionMetadataByHash(
  hash: string,
): Promise<TransactionMetadata | null> {
  const key = `transactions/by_hash/${hash}`;
  const content = await getObjectContent(key);

  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as TransactionMetadata;
  } catch (error) {
    console.error(
      `Failed to parse transaction metadata for hash ${hash}:`,
      error,
    );
    return null;
  }
}

export interface BundleTransaction {
  signer: string;
  type: string;
  chainId: string;
  nonce: string;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  to: string | null;
  value: string;
  accessList: unknown[];
  input: string;
  r: string;
  s: string;
  yParity: string;
  v: string;
  hash: string;
}

export interface MeterBundleResult {
  coinbaseDiff: string;
  ethSentToCoinbase: string;
  fromAddress: string;
  gasFees: string;
  gasPrice: string;
  gasUsed: number;
  toAddress: string;
  txHash: string;
  value: string;
  executionTimeUs: number;
}

export interface MeterBundleResponse {
  bundleGasPrice: string;
  bundleHash: string;
  coinbaseDiff: string;
  ethSentToCoinbase: string;
  gasFees: string;
  results: MeterBundleResult[];
  stateBlockNumber: number;
  totalGasUsed: number;
  totalExecutionTimeUs: number;
  stateRootTimeUs: number;
  stateRootAccountLeafCount: number;
  stateRootAccountBranchCount: number;
  stateRootStorageLeafCount: number;
  stateRootStorageBranchCount: number;
}

export interface BundleData {
  uuid: string;
  txs: BundleTransaction[];
  block_number: string;
  max_timestamp: number;
  reverting_tx_hashes: string[];
  meter_bundle_response: MeterBundleResponse;
}

export interface BundleEventData {
  key: string;
  timestamp: number;
  bundle?: BundleData;
  block_number?: number;
  block_hash?: string;
  builder?: string;
  flashblock_index?: number;
  reason?: string;
}

export interface BundleEvent {
  event: string;
  data: BundleEventData;
}

export interface BundleHistory {
  history: BundleEvent[];
}

export async function getBundleHistory(
  bundleKey: string,
): Promise<BundleHistory | null> {
  const prefix = `bundles/${bundleKey}/`;
  const listCommand = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  });

  const listResponse = await s3Client.send(listCommand);
  const keys = listResponse.Contents?.map((obj) => obj.Key).filter(
    Boolean,
  ) as string[];

  if (!keys || keys.length === 0) {
    return null;
  }

  const history: BundleEvent[] = [];
  for (const key of keys) {
    const content = await getObjectContent(key);
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

export interface BlockTransaction {
  hash: string;
  from: string;
  to: string | null;
  gasLimit: bigint;
  bundleId: string | null;
  index: number;
  meterBundleResponse: Record<string, unknown> | null;
}

export interface BlockData {
  hash: string;
  number: bigint;
  timestamp: bigint;
  transactions: BlockTransaction[];
  gasUsed: bigint;
  gasLimit: bigint;
  cachedAt: number;
}

export async function getBlockFromCache(
  blockHash: string,
): Promise<BlockData | null> {
  const key = `blocks/${blockHash}`;
  const content = await getObjectContent(key);

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
      transactions: parsed.transactions.map(
        (tx: { gasLimit?: string; [key: string]: unknown }) => ({
          ...tx,
          gasLimit: BigInt(tx.gasLimit ?? "0"),
          meterBundleResponse: tx.meterBundleResponse ?? null,
        }),
      ),
    } as BlockData;
  } catch (error) {
    console.error(`Failed to parse block data for hash ${blockHash}:`, error);
    return null;
  }
}

export interface RejectionReason {
  executionTimeExceeded?: {
    tx_time_us: number;
    limit_us: number;
  };
}

export interface RejectedTransaction {
  blockNumber: number;
  txHash: string;
  reason: RejectionReason;
  timestamp: number;
  metering: MeterBundleResponse;
}

export function formatRejectionReason(
  reason: RejectionReason | string,
): string {
  if (typeof reason === "string") return reason;
  if (reason?.executionTimeExceeded) {
    const { tx_time_us, limit_us } = reason.executionTimeExceeded;
    return `Execution time exceeded: ${tx_time_us.toLocaleString()}μs > ${limit_us.toLocaleString()}μs limit`;
  }
  return "Unknown reason";
}

export interface RejectedTransactionSummary {
  blockNumber: number;
  txHash: string;
}

export async function listRejectedTransactions(
  limit = 100,
): Promise<RejectedTransactionSummary[]> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "rejected/",
      MaxKeys: limit,
    });

    const response = await s3Client.send(command);
    const contents = response.Contents || [];

    const summaries: RejectedTransactionSummary[] = [];
    for (const obj of contents) {
      if (!obj.Key) continue;
      // S3 key format matches Rust S3Key::Rejected: rejected/{block_number}/{tx_hash}
      const parts = obj.Key.split("/");
      if (parts.length !== 3) continue;
      const blockNumber = parseInt(parts[1], 10);
      const txHash = parts[2];
      if (Number.isNaN(blockNumber) || !txHash) continue;
      summaries.push({ blockNumber, txHash });
    }

    summaries.sort((a, b) => b.blockNumber - a.blockNumber);
    return summaries;
  } catch (error) {
    console.error("Failed to list rejected transactions:", error);
    return [];
  }
}

export async function getRejectedTransaction(
  blockNumber: number,
  txHash: string,
): Promise<RejectedTransaction | null> {
  const key = `rejected/${blockNumber}/${txHash}`;
  const content = await getObjectContent(key);

  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as RejectedTransaction;
  } catch (error) {
    console.error(
      `Failed to parse rejected transaction ${blockNumber}/${txHash}:`,
      error,
    );
    return null;
  }
}

export async function cacheBlockData(blockData: BlockData): Promise<void> {
  const key = `blocks/${blockData.hash}`;

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(blockData, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
      ContentType: "application/json",
    });

    await s3Client.send(command);
  } catch (error) {
    console.error(`Failed to cache block data for ${blockData.hash}:`, error);
  }
}
